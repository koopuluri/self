import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { stamp } from './io.mjs';
import { planCallError, planDiagnosticCode, planPayload } from './chatgpt.mjs';
import { describeException, modelCallScope, ModelCallDiagnostics } from './model-diagnostics.mjs';

export async function modelCall(agent, config, model, context, signal, link, onDelta) {
  const plan = config.provider === 'chatgpt';
  let request;
  const providerEvents = [];
  const callId = link.callId ?? randomUUID(), startedAt = stamp(), start = Date.now(); let result, failure = null, firstTokenAt = null, returnedModel = null, planUsage = false;
  const trace = new ModelCallDiagnostics(), diagnostic = trace.summary;
  let userError;
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY']) {
    if (process.env[key]) trace.secrets.add(process.env[key]);
  }
  try {

    if (!model) throw new Error('The selected model is unavailable.');
    const shared = await fs.readFile(agent.instructionsFile, 'utf8');
    context = { ...context, systemPrompt: `Shared workspace instructions (AGENTS.md):\n${shared.trimEnd()}\n\nInstructions for this call:\n${context.systemPrompt ?? ''}` };
    for (const message of context.messages ?? []) if (Array.isArray(message.content)) {
      for (const block of message.content) if (block.type === 'image' && block.data) trace.secrets.add(block.data);
    }
    const options = { maxTokens: 8192, reasoning: config.reasoning === 'default' ? undefined : config.reasoning, signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) };
    if (plan) {
      const token = await agent.plan('grant');
      if (typeof token !== 'string' || !token.trim()) throw new Error('Your ChatGPT connection needs authorization.');
      trace.secrets.add(token);
      options.apiKey = token;
      options.maxRetries = 0;

      options.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.href !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected plan endpoint');
        return fetch(input, { ...init, redirect: 'error' });
      };
    }
    options.onPayload = payload => {
      request = plan ? planPayload(payload, config.reasoning) : payload;
      return request;
    };
    options.onProviderStreamEvent = event => {
      if (!event || typeof event !== 'object') return;
      trace.observe(event);
      providerEvents.push(event);
      if (event.response?.model) returnedModel = event.response.model;
      if (event.response?.usage) planUsage = true;
      if (event.type === 'error' || event.response?.error) diagnostic.code = planDiagnosticCode(event.response?.error ?? event);
      if (event.type === 'error' || event.type === 'response.failed') diagnostic.event = event.type;
    };
    result = await modelCallScope.run(trace, async () => {
      const stream = agent.catalog.streamSimple(model, context, options);
      for await (const event of stream) {
        if (event.type === 'text_delta' && !signal.aborted) {
          firstTokenAt ??= stamp();
          onDelta?.(event);
        }
      }
      return stream.result();
    });

    if (!result) throw new Error('The model request did not return a result.');
    if (['error', 'aborted'].includes(result.stopReason)) {
      failure = result.errorMessage ?? `Model returned stop reason ${result.stopReason} without an error message.`;
      userError = plan ? planCallError(failure, diagnostic) : trace.redact(failure);
    }
  } catch (error) {
    trace.exception = describeException(error);
    failure = error?.message ?? String(error);
    userError = plan ? planCallError(failure, diagnostic) : trace.redact(failure);
    throw new Error(userError);
  } finally {
    const usage = result && (!plan || planUsage) && (result.stopReason !== 'error' || result.usage?.totalTokens > 0) ? result.usage : null;
    const entry = {
      ...link, callId, provider: model?.provider ?? config.provider,
      auth: plan ? 'chatgpt-plan' : 'api-key', requestedModel: config.model, requestedReasoning: config.reasoning ?? 'default', returnedModel: plan ? returnedModel : result?.model ?? null,
      startedAt, firstTokenAt, endedAt: stamp(), durationMs: Date.now() - start, status: result?.stopReason ?? 'error',
      usage: plan && usage ? Object.fromEntries(Object.entries(usage).filter(([key]) => key !== 'cost')) : usage,
      costUSD: plan ? null : usage?.cost?.total ?? null, costBasis: plan ? 'chatgpt-plan' : usage ? usage.cost?.totalFromProvider ? 'provider-reported' : 'catalog-estimate' : 'unavailable',
      ratesPerMillion: plan ? null : model?.cost, error: failure,
    };
    if (failure !== null || trace.attempts.length || trace.events.length || trace.frames.length) {
      entry.diagnostic = diagnostic;
      entry.failureDetails = { httpAttempts: trace.attempts, providerEvents: trace.events, streamErrorFrames: trace.frames, streamException: trace.streamException, exception: trace.exception, sdkMessage: result?.errorMessage };
    }
    entry.request = request ?? context;
    if (trace.requests?.length) entry.requestBodies = trace.requests;
    if (trace.responses?.length) entry.responseBodies = trace.responses.map(chunks => chunks.join(''));
    entry.response = result ?? null;
    if (providerEvents.length) entry.providerEvents = providerEvents;
    const line = trace.json(entry) + '\n';
    const write = agent.logWrites.then(() => fs.appendFile(path.join(agent.store.pi, 'logs/model-calls.jsonl'), line, { mode: 0o600 }));
    agent.logWrites = write.catch(() => {});
    await write;
  }
  signal.throwIfAborted();
  if (!result || ['error', 'aborted'].includes(result.stopReason)) throw new Error(userError || 'Model request failed.');
  return result;
}
