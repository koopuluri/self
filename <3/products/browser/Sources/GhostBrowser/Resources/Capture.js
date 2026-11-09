(() => {
  'use strict';
  if (window !== window.top || window.__ghostInstalled) return;
  window.__ghostInstalled = true;
  const adapter = window.GhostXAdapter;
  const bridge = window.webkit?.messageHandlers?.ghost;
  if (!bridge) return;
  const send = value => { try { bridge.postMessage(value); } catch {} };
  let current = location.href;
  let intent = null;
  let paused = false;
  let generation = 0;
  window.__ghostSetPaused = value => { paused = !!value; generation++; intent = null; };
  const http = value => { try { return /^https?:$/.test(new URL(value, location.href).protocol); } catch { return false; } };
  const navigation = () => {
    const next = location.href;
    if (next === current) return;
    const source = current; current = next;
    // Record deliberate SPA arrivals, not every replaceState/URL decoration.
    if (!paused && intent && Date.now() - intent.time < 10000 && http(next)) {
      send({ kind: 'navigation', url: next, source_url: intent.source || source, navigation_kind: intent.kind, ...adapter.navigation(next, intent.source || source) });
    }
    intent = null;
  };
  document.addEventListener('click', event => {
    if (!event.isTrusted || paused) return;
    const link = event.target?.closest?.('a[href]');
    if (link && http(link.href)) {
      const context = { kind: 'link', url: link.href, source_url: location.href, ...adapter.navigation(link.href, location.href) };
      send(context);
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && link.target !== '_blank') intent = { source: location.href, time: Date.now(), kind: 'link' };
    } else if (!event.target?.closest?.('input,textarea,[contenteditable="true"]')) {
      // Sites also navigate from clickable cards and divs. Keep only transient source
      // context; a click itself is never recorded, nor are labels or form contents.
      intent = { source: location.href, time: Date.now(), kind: 'site_navigation' };
    }
  }, true);
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (...args) { const result = original.apply(this, args); navigation(); return result; };
  }
  window.addEventListener('popstate', () => { intent = { source: current, time: Date.now(), kind: 'back_forward' }; navigation(); });
  window.addEventListener('hashchange', navigation);
  send({ kind: 'ready', adapter: adapter.xURL(location.href) ? 'x' : 'navigation' });
  if (!adapter.xURL(location.href)) return;

  function postSnapshot(body) {
    const id = adapter.variables(body).tweet_id;
    if (!id) return null;
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      const permalink = Array.from(article.querySelectorAll('a[href*="/status/"]')).find(a => a.querySelector('time') && new URL(a.href).pathname.endsWith(`/status/${id}`));
      if (!permalink) continue;
      const handle = new URL(permalink.href).pathname.split('/')[1];
      const media = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img')).slice(0, 16).map(img => ({ url: img.currentSrc || img.src, alt: img.alt || null }));
      return { url: permalink.href, author: { handle }, text: article.querySelector('[data-testid="tweetText"]')?.innerText || '', media };
    }
    return null;
  }
  function context(body) { return { source_url: location.href, post: postSnapshot(body) }; }
  function capture(request, response, status, ctx, epoch) {
    if (paused || epoch !== generation) return;
    const event = adapter.normalize({ ...request, response, status, context: ctx });
    if (event) send({ kind: 'event', ...event });
    else if (status >= 200 && status < 300) {
      let result; try { result = typeof response === 'string' ? JSON.parse(response) : response; } catch {}
      if (!result?.errors?.length && !result?.error) send({ kind: 'capture_problem', message: 'X returned an unfamiliar response. This action could not be recorded accurately.' });
    }
  }

  // Observe only the allowlisted writes; never retain headers, cookies or unrelated requests.
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' || input instanceof URL ? new URL(String(input), location.href).href : input.url;
    const method = init?.method || input?.method || 'GET';
    if (paused || !adapter.operation(url, method)) return originalFetch.apply(this, arguments);
    const epoch = generation, source = location.href;
    const bodyPromise = typeof init?.body === 'string' ? Promise.resolve(init.body) : input instanceof Request ? input.clone().text() : Promise.resolve('');
    const ctxPromise = bodyPromise.then(body => ({ ...context(body), source_url: source }));
    const result = originalFetch.apply(this, arguments);
    result.then(async response => {
      try { const copy = response.clone(); const body = await bodyPromise; const ctx = await ctxPromise; capture({ url, method, body }, await copy.text(), response.status, ctx, epoch); } catch {
        if (!paused && epoch === generation) send({ kind: 'capture_problem', message: 'Could not inspect an X action response.' });
      }
    }, () => {});
    return result;
  };
  const xhr = XMLHttpRequest.prototype;
  const originalOpen = xhr.open, originalSend = xhr.send;
  const requests = new WeakMap();
  xhr.open = function (method, url, ...rest) {
    requests.delete(this);
    const absolute = new URL(String(url), location.href).href;
    if (adapter.operation(absolute, method)) requests.set(this, { method, url: absolute });
    return originalOpen.call(this, method, url, ...rest);
  };
  xhr.send = function (body) {
    const request = requests.get(this);
    if (request && !paused) {
      const epoch = generation, ctx = context(body);
      this.addEventListener('load', () => {
        try {
          const response = this.responseType === 'json' ? this.response : this.responseText;
          capture({ ...request, body }, response, this.status, ctx, epoch);
        } catch { if (!paused && epoch === generation) send({ kind: 'capture_problem', message: 'Could not inspect an X action response.' }); }
      }, { once: true });
    }
    return originalSend.apply(this, arguments);
  };
})();
