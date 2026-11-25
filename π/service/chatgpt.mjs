export function planError(error) {
  const detail = String(error?.error || error?.code || error?.message || '');
  if (/usage_limit|rate.limit|quota|429/i.test(detail)) return 'Your ChatGPT usage limit was reached. Check usage in ChatGPT Settings and retry this thread when capacity returns.';
  if (/usage_unavailable|fetch failed|timeout|ENOTFOUND|ECONNRESET/i.test(detail)) return 'ChatGPT is temporarily unavailable. Retry this thread in a moment.';
  if (/access_denied|abort|cancel/i.test(detail)) return 'ChatGPT sign-in was cancelled or expired. You can connect again.';
  if (/invalid_grant|invalid_token|unauthorized|401|reauth/i.test(detail)) return 'Your ChatGPT connection needs authorization. Ask π to connect your ChatGPT again.';
  if (/scope|not_eligible|403|sharing/i.test(detail)) return 'ChatGPT plan usage is unavailable for this connection. Check the selected workspace and plan permissions.';
  if (/model_not_found|unavailable model/i.test(detail)) return 'That model is unavailable. Ask π to list models for ChatGPT and select one.';
  if (/keychain/i.test(detail)) return 'Unlock the macOS keychain and try connecting again.';
  return 'ChatGPT could not complete the request.';
}

export function planDiagnosticCode(error) {
  const code = error?.code ?? error?.type;
  if (typeof code === 'string' && code.length <= 80 && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(code)) return code;
}

export function planCallError(detail, { httpStatus, code }) {
  const reason = [code, detail].filter(Boolean).join(' ');
  if (/context_length_exceeded|context_window_exceeded/i.test(reason)) return 'This conversation exceeds the model’s context window.';
  if (/invalid_request|invalid_value|invalid_prompt|unsupported_parameter/i.test(reason) || httpStatus === 400 || httpStatus === 422) return 'ChatGPT rejected the request that Stream sent.';
  if (/server_error|internal_error|overloaded|service_unavailable/i.test(reason) || httpStatus >= 500) return 'ChatGPT had a server error before finishing the answer. You can continue in this chat.';
  if (/abort|cancel|timeout|timed out/i.test(reason)) return 'The model request was interrupted. You can continue in this chat.';
  if (/stream ended|stream completed with an unfinished/i.test(reason)) return 'The response stream ended before the answer was complete. You can continue in this chat.';
  return planError(new Error([reason, httpStatus].filter(Boolean).join(' ')));
}

export function modelForPlan(catalog, id) {
  const known = catalog.getModel('openai', id);
  if (known?.api === 'openai-responses') return known;
  // The account catalog can advertise a newer model than the bundled SDK.
  return { id, name: id, provider: 'openai', api: 'openai-responses', baseUrl: 'https://api.openai.com/v1',
    input: ['text', 'image'], reasoning: false, maxTokens: 8192, contextWindow: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

// Plan access supports local functions inside a namespace or additional_tools items.
export function planPayload(payload, reasoning) {
  const input = payload.input.map(item => item.role === 'system' ? { ...item, role: 'developer' } : item);
  const request = { model: payload.model, input, store: false, stream: true };
  if (payload.instructions) request.instructions = payload.instructions;
  if (reasoning && reasoning !== 'default') request.reasoning = { ...payload.reasoning, effort: reasoning };
  if (payload.include) request.include = payload.include;
  if (payload.tools?.length) request.tools = [{ type: 'namespace', name: 'stream', description: 'Local Stream functions', tools: payload.tools }];
  return request;
}
