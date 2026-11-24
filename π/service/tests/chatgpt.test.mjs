import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as oidc from 'openid-client';
import { PlanConnection } from '../plan.mjs';
import { StreamStore } from '../store.mjs';
import { observeModelFetch } from '../model-diagnostics.mjs';
import { Coordinator } from '../agent.mjs';

async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-plan-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('system browser callback verifies state, PKCE and signed identity, persists and rotates the grant', async t => {
  const directory = await temp(t);
  const issuer = 'https://auth.openai.com';
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' };
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  let auth, host, refreshes = 0, wrongNonce = false, revoked = false;
  const args = {
    directory, appName: 'Stream Preview',
    safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s, 'utf8'), decryptString: b => b.toString('utf8') },
    async openBrowser(target) {
      const url = new URL(target);
      assert.equal(url.origin, issuer);
      auth = url.searchParams;
      host ??= auth.get('ext_agent_host_id');
      assert.equal(auth.get('ext_agent_host_id'), host);
      assert.ok(auth.get('scope').includes('chatgpt.tokens.use.direct'));
      const redirect = new URL(auth.get('redirect_uri'));
      assert.equal(redirect.hostname, '127.0.0.1');
      redirect.searchParams.set('code', 'fixture-code');
      redirect.searchParams.set('state', 'wrong');
      assert.equal((await fetch(redirect)).status, 400);
      redirect.searchParams.set('state', auth.get('state'));
      if (auth.get('client_id') === 'dynamic_agent_client') redirect.searchParams.set('client_id', 'issued_fixture');
      assert.equal((await fetch(redirect)).status, 200);
    },
    async discover(id) {
      const config = new oidc.Configuration({ issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token',
        jwks_uri: issuer + '/jwks', revocation_endpoint: issuer + '/revoke' }, id, {}, oidc.None());
      oidc.enableNonRepudiationChecks(config);
      config[oidc.customFetch] = async (target, init) => {
        if (target.endsWith('/jwks')) return Response.json({ keys: [jwk] });
        assert.equal(init.body.get('client_id'), 'issued_fixture');
        if (target.endsWith('/revoke')) { revoked = true; return new Response(null, { status: 200 }); }
        assert.ok(target.endsWith('/token'));
        const params = init.body;
        assert.equal(params.get('resource'), 'https://api.openai.com/v1');
        const response = { token_type: 'Bearer', scope: 'offline_access chatgpt.tokens.use.direct', access_token: 'first-token', refresh_token: 'first-refresh', expires_in: 45 };
        if (params.get('grant_type') === 'refresh_token') {
          assert.equal(params.get('refresh_token'), 'first-refresh'); refreshes++;
          return Response.json({ ...response, access_token: 'renewed', refresh_token: 'rotated', expires_in: 3600 });
        }
        assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'), auth.get('code_challenge'));
        const now = Math.floor(Date.now()/1000);
        const claims = { sub: 'test-account', iss: issuer, aud: id, nonce: wrongNonce ? 'incorrect' : auth.get('nonce'), iat: now, exp: now+3600 };
        const jwt = encode({ alg: 'RS256', kid: 'fixture' }) + '.' + encode(claims);
        return Response.json({ ...response, id_token: jwt + '.' + sign('RSA-SHA256', Buffer.from(jwt), privateKey).toString('base64url') });
      };
      return config;
    },
    async request(url, options) {
      assert.equal(url, 'https://api.openai.com/v1/models');
      assert.equal(options.headers.Authorization, 'Bearer renewed');
      return Response.json({ models: [{ visibility: 'hide', slug: 'private' }, { visibility: 'list', slug: 'test', display_name: 'Test' }] });
    },
  };
  const first = new PlanConnection(args);
  wrongNonce = true;
  await assert.rejects(first.handle('connect'));
  assert.equal((await first.handle('status')).ready, false);
  wrongNonce = false;
  await first.handle('connect');
  assert.equal(auth.get('client_id'), 'issued_fixture');
  const reopened = new PlanConnection(args);
  assert.equal((await reopened.handle('status')).ready, true);
  assert.deepEqual(await Promise.all([reopened.handle('grant'), reopened.handle('grant')]), ['renewed','renewed']);
  assert.equal(refreshes, 1);
  assert.deepEqual(await reopened.handle('models'), [{ id: 'test', name: 'Test' }]);
  await reopened.handle('disconnect');
  assert.equal(revoked, true);
  assert.equal((await reopened.handle('status')).ready, false);
  await assert.rejects(reopened.handle('grant'));
});

test('plan turns use Responses with local tools, retain a resumable thread, and stop at a plan error', async t => {
  // Count only provider calls made by the task under test.
  t.mock.method(Coordinator.prototype, 'organize', async () => {});
  const store = await new StreamStore(await temp(t)).init();
  const secret = 'fixture-subscription-access';
  let complete;
  const allowed = new Promise(resolve => { complete = resolve; });
  const plan = async action => {
    if (action === 'connect') return allowed;
    if (action === 'models') return [{ id: 'gpt-5.4-mini', name: 'Fixture model' }];
    if (action === 'grant') return secret;
    throw new Error('Unexpected request');
  };
  const agent = new Coordinator(store, plan);
  const id = await agent.prompt({ text: 'connect my ChatGPT' });
  assert.equal((await agent.chat(id)).status, 'running');
  await store.append('Fixture passage');
  complete(); await agent.connectionTask;
  assert.equal((await agent.status()).auth, 'chatgpt-plan');
  const requests = [];
  t.mock.method(globalThis, 'fetch', observeModelFetch(async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + secret);
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length <= 2) assert.equal(body.reasoning.effort, 'high');
    else assert.equal(body.reasoning, undefined);
    assert.ok(Array.isArray(body.input)); assert.equal(body.store, false); assert.equal(body.stream, true);
    assert.equal(body.max_output_tokens, undefined);
    assert.ok(!body.input.some(item => item.role === 'system'));
    assert.ok(body.tools?.some(tool => tool.type === 'namespace') || body.input.some(item => item.type === 'additional_tools'));
    if (requests.length === 3) return Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'subscription_sharing_usage_limit_exceeded ' + secret } }, { status: 429 });
    if (requests.length === 4) {
      const failed = { type: 'response.failed', response: { status: 'failed', model: 'gpt-5.4-mini', error: { code: 'server_error', message: secret } } };
      return new Response('data: ' + JSON.stringify(failed) + '\n\n', { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req_fixture' } });
    }
    const item = requests.length === 1 ? { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'read_beat', namespace: 'stream', arguments: '{"id":0}' } :
      { type: 'message', role: 'assistant', id: 'msg_2', content: [{ type: 'output_text', text: 'Saved reply.' }] };
    const events = [
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } },
    ];
    return new Response(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
  }));
  async function idle(instance) {
    for (let i=0; i<300 && (instance.running.size || instance.runQueue.length); i++) await new Promise(resolve => setTimeout(resolve, 10));
  }
  await agent.localControl('reasoning high');
  await agent.prompt({ chatId: id, text: 'Read my fixture.' }); await idle(agent);
  const chat = await agent.chat(id);
  assert.equal(chat.messages.at(-1).text, 'Saved reply.');
  assert.ok(requests[1].input.some(item => item.type === 'function_call_output' && JSON.stringify(item).includes('Fixture passage')));
  const resumed = new Coordinator(store, plan);
  await resumed.localControl('reasoning default');
  await resumed.prompt({ chatId: id, text: 'Continue here.' }); await idle(resumed);
  const finished = await resumed.chat(id);
  assert.equal(finished.threadId, chat.threadId);
  assert.equal(finished.status, 'failed');
  assert.match(finished.messages.at(-1).text, /usage limit/);
  const thread = await resumed.thread(chat.threadId);
  assert.ok(thread.messages.some(m => m.role === 'toolResult' && m.toolName === 'read_beat'));
  assert.ok(requests[2].input.some(item => JSON.stringify(item).includes('Saved reply.')));
  const md = await fs.readFile(path.join(store.pi, 'chats', id + '.md'), 'utf8');
  assert.match(md, /Saved reply/); assert.match(md, /Continue here/);
  const logs = (await fs.readFile(path.join(store.pi, 'logs/model-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length, 3); assert.equal(logs[0].usage.totalTokens, 10);
  assert.ok(logs.every(log => log.chatId === id && log.threadId === chat.threadId && log.auth === 'chatgpt-plan' && log.costUSD === null));
  assert.equal(logs.at(-1).status, 'error');
  assert.deepEqual(logs.at(-1).diagnostic, { httpStatus: 429, code: 'subscription_sharing_usage_limit_exceeded' });
  const rejected = logs.at(-1);
  assert.equal(rejected.failureDetails.httpAttempts[0].body, JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'subscription_sharing_usage_limit_exceeded [redacted]' } }));
  assert.equal(rejected.error, rejected.failureDetails.sdkMessage);
  assert.ok(!JSON.stringify([finished, thread, md, logs]).includes(secret));
  await resumed.prompt({ chatId: id, text: 'Continue the saved turn.' }); await idle(resumed);
  const failure = (await resumed.chat(id)).messages.at(-1);
  assert.equal(failure.source, 'system-status');
  assert.match(failure.text, /server error/);
  const last = JSON.parse((await fs.readFile(path.join(store.pi, 'logs/model-calls.jsonl'), 'utf8')).trim().split('\n').at(-1));
  assert.deepEqual(last.diagnostic, { httpStatus: 200, requestId: 'req_fixture', event: 'response.failed', code: 'server_error' });
  assert.equal(last.failureDetails.providerEvents[0].response.error.message, '[redacted]');
  assert.match(last.failureDetails.streamErrorFrames[0], /^data: .*server_error/);
  assert.notEqual(last.error, failure.text);
  assert.ok(!JSON.stringify([failure, last]).includes(secret));
});

test('switching to Claude and back preserves thread history and the selected billing path', async t => {
  // Count only provider calls made by the task under test.
  t.mock.method(Coordinator.prototype, 'organize', async () => {});
  const store = await new StreamStore(await temp(t)).init();
  const model = 'gpt-5.4-mini';
  const plan = async action => {
    if (action === 'connect') return true;
    if (action === 'models') return [{ id: model, name: model }];
    if (action === 'grant') return 'fixture-plan';
    throw new Error('Unknown action');
  };
  const agent = new Coordinator(store, plan), seen = [];
  agent.available = provider => provider === 'anthropic';
  agent.catalog = {
    getModel(provider, id) { return { id, provider, api: provider === 'openai' ? 'openai-responses' : 'anthropic-messages' }; },
    streamSimple(selected, context, options) {
      seen.push({ provider: selected.provider, plan: options.apiKey === 'fixture-plan', history: structuredClone(context.messages) });
      const result = { role: 'assistant', content: [{ type: 'text', text: 'Answer from ' + selected.provider }], model: selected.id, provider: selected.provider,
        api: selected.api, stopReason: 'stop', timestamp: Date.now(), usage: { totalTokens: 4, cost: { total: 0.001 } } };
      return { async *[Symbol.asyncIterator]() {}, async result() { return result; } };
    },
  };
  const id = await agent.prompt({ text: 'connect my ChatGPT' });
  await agent.connectionTask;
  const threadId = (await agent.chat(id)).threadId;
  for (const text of ['First question', 'use anthropic/fixture-claude', 'Follow up', 'use openai/' + model, 'Last question']) {
    await agent.prompt({ chatId: id, text });
    for (let i=0; i<300 && agent.running.size; i++) await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.deepEqual(seen.map(s => [s.provider, s.plan]), [['openai',true], ['anthropic',false], ['openai',true]]);
  assert.ok(seen[1].history.some(m => m.content?.[0]?.text === 'Answer from openai'));
  assert.ok(seen[2].history.some(m => m.content?.[0]?.text === 'Answer from anthropic'));
  const logs = (await fs.readFile(path.join(store.pi, 'logs/model-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(logs.map(log => log.costUSD), [null, 0.001, null]);
  assert.ok(logs.every(log => log.threadId === threadId && log.chatId === id));
});
