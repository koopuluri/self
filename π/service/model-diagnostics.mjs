import { AsyncLocalStorage } from 'node:async_hooks';
import { planDiagnosticCode } from './chatgpt.mjs';

export const modelCallScope = new AsyncLocalStorage();

export function describeException(error, seen = new Set()) {
  if (!(error instanceof Error)) return error ?? String(error);
  if (seen.has(error)) return '[circular cause]';
  seen.add(error);
  const detail = { name: error.name, message: error.message, stack: error.stack };
  for (const key of ['code', 'status', 'type', 'param', 'errno', 'syscall', 'request_id', 'requestID', 'error', 'error_description', 'details']) {
    if (error[key] !== undefined) detail[key] = error[key];
  }
  if (error.cause !== undefined) detail.cause = describeException(error.cause, seen);
  if (error instanceof AggregateError) detail.errors = error.errors.map(e => describeException(e, seen));
  return detail;
}

const credentialField = /^(?:authorization|proxy-authorization|x-api-key|x-goog-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|cookie|set-cookie)$/i;
function failedEvent(event) {
  return event && typeof event === 'object' && (event.type === 'error' || event.type === 'response.failed' ||
    event.error || event.response?.error || event.type === 'response.incomplete' || event.promptFeedback?.blockReason ||
    event.choices?.some?.(choice => choice.finish_reason === 'error'));
}
export class ModelCallDiagnostics {
  constructor() {
    this.secrets = new Set();
    this.attempts = [];
    this.events = [];
    this.frames = [];
    this.summary = {};
  }
  redact(text) {
    let value = text;
    for (const secret of this.secrets) if (secret) value = value.replaceAll(secret, '[redacted]');
    return value.replace(/(\bBearer\s+)[\w.+/~=-]+/gi, '$1[redacted]')
      .replace(/("(?:api[_-]?key|access_token|refresh_token|id_token|client_secret)"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2');
  }
  json(value) {
    // Preserve error text, line breaks and nested fields, including in the SDK's
    // exception stack. Only credential fields and known credential values change.
    const ancestors = [];
    const redact = text => this.redact(text);
    return JSON.stringify(value, function (key, item) {
      if (credentialField.test(key)) return '[redacted]';
      if (typeof item === 'string') return redact(item);
      if (typeof item === 'bigint') return String(item);
      if (item && typeof item === 'object') {
        while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
        if (ancestors.includes(item)) return '[circular]';
        ancestors.push(item);
      }
      return item;
    });
  }
  observe(event) {
    if (failedEvent(event)) this.events.push(event);
  }
}

// Some SDKs throw on an SSE error before invoking their provider-event callback.
// Inspect complete frames while passing the original bytes through with backpressure.
function captureStreamErrors(response, trace) {
  const decoder = new TextDecoder();
  let buffer = '';
  const body = [];
  (trace.responses ??= []).push(body);
  function consume(final) {
    const frames = buffer.split(/\r\n\r\n|\n\n|\r\r/);
    buffer = final ? '' : frames.pop();
    for (const frame of frames) {
      if (!/error|failed|incomplete|blockReason/i.test(frame)) continue;
      const lines = frame.split(/\r\n|\r|\n/);
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
      let event;
      try { event = JSON.parse(data); } catch { /* Named SSE errors can be plain text. */ }
      if (failedEvent(event) || lines.some(line => /^event:\s*(error|response\.failed|response\.incomplete)\s*$/.test(line))) trace.frames.push(frame);
    }
  }
  const observer = new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true }); body.push(text); buffer += text; consume(false); controller.enqueue(chunk);
    },
    flush() { const tail = decoder.decode(); body.push(tail); buffer += tail; consume(true); },
  });
  void response.body.pipeTo(observer.writable).catch(error => { trace.streamException = describeException(error); });
  const observed = new Response(observer.readable, response);
  for (const key of ['url', 'redirected', 'type']) Object.defineProperty(observed, key, { value: response[key] });
  return observed;
}

// The isolated model service installs this once. AsyncLocalStorage associates
// each fetch with its call, including Google, whose SDK only uses global fetch.
export function observeModelFetch(fetchImpl) {
  return async function observedFetch(input, init) {
    const trace = modelCallScope.getStore();
    if (!trace) return fetchImpl(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    for (const [key, value] of new Headers(init?.headers)) headers.set(key, value);
    for (const [key, value] of headers) if (credentialField.test(key)) trace.secrets.add(value.replace(/^Bearer\s+/i, ''));
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof body === 'string' || body instanceof Uint8Array) {
      (trace.requests ??= []).push(typeof body === 'string' ? body : Buffer.from(body).toString('utf8'));
    }
    let response;
    try { response = await fetchImpl(input, init); }
    catch (error) { trace.attempts.push({ exception: describeException(error) }); throw error; }
    const { status, statusText } = response;
    const requestId = response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? response.headers.get('x-goog-request-id');
    delete trace.summary.code;
    delete trace.summary.requestId;
    trace.summary.httpStatus = status;
    if (requestId) trace.summary.requestId = requestId;
    if (!response.ok) {
      const attempt = { status, statusText, requestId, contentType: response.headers.get('content-type') };
      try {
        const bytes = Buffer.from(await response.clone().arrayBuffer());
        attempt.body = bytes.toString('utf8');
        if (!bytes.equals(Buffer.from(attempt.body))) {
          attempt.body = bytes.toString('latin1');
          attempt.bodyEncoding = 'latin1';
        }
      }
      catch (error) { attempt.bodyReadError = describeException(error); }
      try { trace.summary.code = planDiagnosticCode(JSON.parse(attempt.body).error); } catch { /* Non-JSON bodies are also preserved. */ }
      trace.attempts.push(attempt);
    }
    if (response.ok && response.body && response.headers.get('content-type')?.includes('text/event-stream')) return captureStreamErrors(response, trace);
    if (response.ok && response.body) (trace.responses ??= []).push([await response.clone().text()]);
    return response;
  };
}
