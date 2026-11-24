import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import { atomicWrite, readJSON } from './io.mjs';
import { describeException, ModelCallDiagnostics } from './model-diagnostics.mjs';

const issuer = new URL('https://auth.openai.com');
const resource = 'https://api.openai.com/v1';
const planScope = 'chatgpt.tokens.use.direct';
const scope = 'openid profile email offline_access resource.invoke ' + planScope;
const initialId = 'dynamic_agent_client';

// A single-use loopback listener. Ignore unrelated requests without consuming the attempt.
export async function browserCallback(state, signal, authorize) {
  const server = createServer();
  const onListening = once(server, 'listening', { signal });
  server.listen(0, '127.0.0.1');
  try {
    await onListening;
    const origin = 'http://127.0.0.1:' + server.address().port;
    const redirect = origin + '/auth/callback';
    const completed = new Promise(resolve => server.on('request', (req, res) => {
      let url;
      try { url = new URL(req.url, origin); } catch { res.writeHead(400).end(); return; }
      if (req.method !== 'GET' || req.headers.host !== new URL(origin).host || url.origin !== origin ||
          url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state ||
          !(url.searchParams.has('error') || url.searchParams.has('code'))) {
        res.writeHead(400).end('Invalid sign-in callback.'); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      res.end('Return to Stream to see the result of your sign-in.');
      resolve(url);
    }));
    const aborted = once(signal, 'abort').then(() => { throw new Error('cancelled'); });
    signal.throwIfAborted();
    return await Promise.race([aborted, (async () => { await authorize(redirect); return completed; })()]);
  } finally { server.close(); server.closeAllConnections(); }
}

async function configuration(clientId) {
  const config = await oidc.discovery(issuer, clientId, {}, oidc.None(), { timeout: 20, execute: [oidc.enableNonRepudiationChecks] });
  const metadata = config.serverMetadata();
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint']) {
    if (metadata[key] && new URL(metadata[key]).origin !== issuer.origin) throw new Error('Unexpected OpenAI endpoint');
  }
  return config;
}

function grant(tokens, previous) {
  const scopes = tokens.scope ? tokens.scope.split(/\s+/) : previous?.scopes || [];
  if (!scopes.includes(planScope)) throw new Error('Missing plan scope');
  const refresh = tokens.refresh_token || previous?.refresh;
  if (!tokens.access_token || !refresh || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('Incomplete grant');
  const earliest = tokens.earliest_refresh_at;
  return { access: tokens.access_token, refresh, scopes, expires: Date.now() + tokens.expires_in * 1000,
    refreshAfter: typeof earliest === 'number' ? earliest * 1000 : Date.parse(earliest) || 0 };
}

export class PlanConnection {
  constructor({ directory, safeStorage, openBrowser, appName, discover = configuration, request = fetch }) {
    Object.assign(this, { directory, safeStorage, openBrowser, appName, discover, request });
    this.sessionFile = path.join(directory, 'session.bin');
    this.queue = Promise.resolve();
  }
  async read() {
    let bytes;
    try { bytes = await fs.readFile(this.sessionFile); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Keychain unavailable');
    try { return JSON.parse(this.safeStorage.decryptString(bytes)); } catch { throw new Error('Keychain unavailable'); }
  }
  async write(record) {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Keychain unavailable');
    await atomicWrite(this.sessionFile, this.safeStorage.encryptString(JSON.stringify(record)));
  }
  async connect() {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Keychain unavailable');
    const controller = this.login = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]);
    try {
      const saved = await this.read();
      const hostFile = path.join(this.directory, 'host.json');
      let hostId = await readJSON(hostFile, null);
      if (!hostId) { hostId = 'urn:uuid:' + randomUUID(); await atomicWrite(hostFile, JSON.stringify(hostId)); }
      const state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
      const challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const config = await this.discover(saved.clientId || initialId);
      const callback = await browserCallback(state, signal, async redirect => {
        const params = { redirect_uri: redirect, response_type: 'code', resource, scope, state, nonce,
          code_challenge: challenge, code_challenge_method: 'S256', ext_agent_host_id: hostId };
        if (!saved.clientId) params.agent_name_hint = this.appName;
        const url = oidc.buildAuthorizationUrl(config, params);
        if (url.origin !== issuer.origin) throw new Error('Unexpected authorization endpoint');
        await this.openBrowser(url.href);
      });
      if (callback.searchParams.has('error')) throw new Error('access_denied');
      const clientId = callback.searchParams.get('client_id') || saved.clientId;
      if (!clientId || !/^[\w-]{1,200}$/.test(clientId) || clientId === initialId || (saved.clientId && saved.clientId !== clientId)) throw new Error('Invalid registration');
      if (!saved.clientId) await this.write({ clientId });
      const issued = saved.clientId ? config : await this.discover(clientId);
      const tokens = await oidc.authorizationCodeGrant(issued, callback, { expectedState: state, expectedNonce: nonce, pkceCodeVerifier: verifier, idTokenExpected: true }, { resource });
      const subject = tokens.claims()?.sub;
      if (!subject || (saved.subject && saved.subject !== subject)) throw new Error('Account changed');
      signal.throwIfAborted();
      await this.write({ clientId, subject, ...grant(tokens) });
      return true;
    } finally { this.login = undefined; }
  }
  async handle(action) {
    const grantTrace = action === 'grant' ? new ModelCallDiagnostics() : null;
    // Queue refresh and replacement of rotating credentials across both concurrent threads.
    if (action === 'disconnect') this.login?.abort();
    if (action === 'status' && this.login) return { ready: false, connecting: true };
    const work = this.queue.then(async () => {
      if (action === 'connect') return this.connect();
      let record = await this.read();
      if (grantTrace) {
        if (record.access) grantTrace.secrets.add(record.access);
        if (record.refresh) grantTrace.secrets.add(record.refresh);
      }
      if (action === 'status') return { ready: Boolean(record.access) };
      if (action === 'disconnect') {
        if (!record.refresh) return true;
        let revoked = false;
        try { await oidc.tokenRevocation(await this.discover(record.clientId), record.refresh, { token_type_hint: 'refresh_token' }); revoked = true; }
        finally { await this.write({ clientId: record.clientId, subject: record.subject }); }
        return revoked;
      }
      if (!['grant','models'].includes(action)) throw new Error('Unknown ChatGPT operation');
      if (!record.access) throw new Error('reauth');
      if (record.expires < Date.now() + 60000 && record.refreshAfter <= Date.now()) {
        const tokens = await oidc.refreshTokenGrant(await this.discover(record.clientId), record.refresh, { resource });
        if (tokens.id_token && tokens.claims()?.sub !== record.subject) throw new Error('Account changed');
        record = { ...record, ...grant(tokens, record) };
        await this.write(record);
      }
      if (action === 'grant') return record.access;
      const response = await this.request(resource + '/models', { headers: { Authorization: 'Bearer ' + record.access }, redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(String(response.status));
      const { models } = await response.json();
      return models.filter(m => m.visibility === 'list' && typeof m.slug === 'string' && m.slug && typeof m.display_name === 'string').map(m => {
        const window = m.context_window ?? m.contextWindow;
        return { id: m.slug, name: m.display_name, ...(Number.isSafeInteger(window) && window > 0 ? { contextWindow: window } : {}) };
      });
    });
    this.queue = work.catch(() => {});
    if (grantTrace) return work.catch(error => {
      const detail = JSON.parse(grantTrace.json(describeException(error)));
      throw Object.assign(new Error(detail.message ?? String(detail)), { grantFailure: detail });
    });
    return work;
  }
}
