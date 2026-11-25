import { SessionManager, compact, convertToLlm, DEFAULT_COMPACTION_SETTINGS, estimateTokens, shouldCompact } from '@earendil-works/pi-coding-agent';

// Pi 1.5.2 exports compact(), but its preparation and projection estimator are
// internal. Keep the version-pinned SDK integration here.
const { prepareCompaction, estimateProjectedContextTokens } = await import(
  new URL('./core/compaction/compaction.js', import.meta.resolve('@earendil-works/pi-coding-agent'))
);
const sessions = new WeakMap();

export function hydrate(record) {
  const { session, status, runState, ...fields } = record;
  if (!session) return { ...record, lifecycle: 'open' };
  return { ...fields, lifecycle: status, status: runState, session,
    messages: session.filter(entry => entry.type === 'message').map(entry => entry.message) };
}

function manager(thread, cwd) {
  let state = sessions.get(thread);
  if (!state) {
    const manager = SessionManager.inMemory(cwd, { id: thread.id }, thread.session);
    state = { manager, count: thread.session?.filter(entry => entry.type === 'message').length ?? 0 };
    sessions.set(thread, state);
    delete thread.session;
  }
  while (state.count < thread.messages.length) {
    state.manager.appendMessage(thread.messages[state.count++]);
  }
  return state.manager;
}

export function recordArchive(thread, cwd, event) {
  manager(thread, cwd).appendCustomEntry('thread.archived', event);
}

export function serializeThread(thread, cwd) {
  const pi = manager(thread, cwd);
  const { messages, lifecycle, status, ...fields } = thread;
  return { ...fields, status: lifecycle ?? 'open', runState: status, session: [pi.getHeader(), ...pi.getEntries()] };
}

export async function taskContext(agent, thread, model, config, systemPrompt, tools, signal, call, force = false) {
  if (!model) throw new Error('The selected model is unavailable.');
  const pi = manager(thread, agent.store.root);
  const branch = pi.getBranch();
  const projection = pi.buildSessionProjection();
  const budget = config.contextWindows?.[config.model] || model.contextWindow || 32768;
  const settings = { ...DEFAULT_COMPACTION_SETTINGS,
    reserveTokens: Math.min(DEFAULT_COMPACTION_SETTINGS.reserveTokens, Math.floor(budget / 3)),
    keepRecentTokens: Math.min(DEFAULT_COMPACTION_SETTINGS.keepRecentTokens, Math.floor(budget / 4)) };
  const base = Math.ceil((systemPrompt.length + JSON.stringify(tools).length) / 3);
  const estimate = estimateProjectedContextTokens(projection, branch);
  const size = estimate.tokens + (estimate.usageTokens ? 0 : base);
  if (force || shouldCompact(size, budget, settings)) {
    let prep = prepareCompaction(branch, settings);
    // An unusually large early message can straddle Pi's preferred cut point.
    // Keep the newest turn and let Pi pick the nearest legal tool boundary.
    if (!prep?.messagesToSummarize.length && !prep?.turnPrefixMessages.length) {
      prep = prepareCompaction(branch, { ...settings, keepRecentTokens: 1 });
    }
    if (prep && (prep.messagesToSummarize.length || prep.turnPrefixMessages.length)) {
      const stream = (_model, context) => ({ result: () => call(context, 'compact-thread') });
      const result = await compact(prep, { ...model, contextWindow: budget, maxTokens: model.maxTokens || 8192 },
        undefined, undefined, 'Keep beat references, exact constraints, completed actions, verification and pending work.', signal,
        undefined, stream);
      pi.appendCompaction(result.summary, result.firstKeptEntryId, result.tokensBefore, result.details, false, result.usage);
      await agent.saveThread(thread);
    }
    // A single tool result may be larger than the entire retained tail. Pi
    // keeps the call/result pair together; shorten only its projected text.
    let edited = false;
    const chunk = Math.max(256, Math.min(12000, budget));
    for (const { sourceEntry, messages } of pi.buildSessionProjection().entries) {
      const result = messages.find(m => m.role === 'toolResult');
      if (!result || estimateTokens(result) <= chunk / 4) continue;
      const full = result.content.map(b => b.text ?? '').join('\n');
      pi.appendContextEdit(sourceEntry.id, { content: [{ type: 'text', text: full.slice(0, chunk / 2) +
        '\n[Full result saved. Use read_tool_result with toolCallId ' + result.toolCallId + ' and a character offset.]\n' +
        full.slice(-chunk / 2) }] });
      edited = true;
    }
    if (edited) await agent.saveThread(thread);
    if (force && !edited && !prep?.messagesToSummarize.length && !prep?.turnPrefixMessages.length)
      throw new Error('This request exceeds the model window after compacting the available history.');
  }
  return { systemPrompt, tools, messages: convertToLlm(pi.buildSessionContext().messages) };
}
