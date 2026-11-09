// Read-only public access. Deploy only on Workers Free, fail closed, without a bucket bypass.
// The release manifest is bundled, so checking it never incurs an R2 operation.
import manifest from './release.json' with { type: 'json' };

export function createHandler(files) {
  return async function fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (env.SERVING_ENABLED !== 'true') return new Response('media unavailable', { status: 503 });
    let source;
    try { source = decodeURIComponent(new URL(request.url).pathname).slice(1); }
    catch { return new Response('not found', { status: 404 }); }
    if (source.split('/').some(part => part === '.' || part === '..') || source.includes('\\') || !Object.hasOwn(files, source)) return new Response('not found', { status: 404 });
    const item = files[source];
    if (!item.key.startsWith('sha256/') || !Number.isSafeInteger(item.bytes)) return new Response('media unavailable', { status: 503 });
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Type': item.type ?? 'application/octet-stream', ETag: `"${item.sha256}"` });
    // Conditional and range decisions use bundled metadata; GET/HEAD makes at most one R2 read.
    if (request.headers.get('if-none-match')?.split(',').map(value => value.trim()).some(value => value === '*' || value.replace(/^W\//, '') === headers.get('ETag'))) return new Response(null, { status: 304, headers });
    let start = 0, end = item.bytes - 1;
    const range = request.method === 'GET' ? request.headers.get('range') : null;
    const ifRange = request.headers.get('if-range');
    const useRange = range && (!ifRange || ifRange === headers.get('ETag'));
    if (useRange) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const invalid = () => new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${item.bytes}`, 'Cache-Control': 'no-store' } });
      if (!match || (!match[1] && !match[2])) return invalid();
      if (!match[1]) start = Math.max(0, item.bytes - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= item.bytes) return invalid();
      headers.set('Content-Range', `bytes ${start}-${end}/${item.bytes}`);
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    try {
      const object = request.method === 'HEAD' ? await env.MEDIA.head(item.key) : await env.MEDIA.get(item.key, useRange ? { range: { offset: start, length: end - start + 1 } } : undefined);
      if (!object) return new Response('not found', { status: 404, headers: { 'Cache-Control':'no-store' } });
      if (object.size !== item.bytes) return new Response('media unavailable', { status: 503 });
      return new Response(request.method === 'HEAD' ? null : object.body, { status: useRange ? 206 : 200, headers });
    } catch { return new Response('media unavailable', { status: 503, headers: { 'Cache-Control':'no-store' } }); }
  };
}
export default { fetch: createHandler(manifest.files) };
