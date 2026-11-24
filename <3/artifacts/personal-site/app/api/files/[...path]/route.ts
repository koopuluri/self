import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { inventory, workspaceRoot } from "@/lib/workspace.mjs";

export const runtime = "nodejs";
const mime: Record<string, string> = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml', '.mp4':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.m4a':'audio/mp4', '.pdf':'application/pdf' };
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  // Local preview only. Production media must go through the capped public gateway.
  if (process.env.NODE_ENV !== 'development') return new Response('Public media hosting has not been configured.', { status: 503 });
  const segments = (await params).path;
  let source = segments.join('/');
  if (!inventory().files.has(source)) {
    try { source = segments.map(decodeURIComponent).join('/'); } catch { return new Response('not found', { status: 404 }); }
  }
  if (inventory().files.get(source)?.kind !== 'media') return new Response('not found', { status: 404 });
  const absolute = await realpath(path.join(workspaceRoot, source));
  if (!absolute.startsWith(await realpath(workspaceRoot) + path.sep)) return new Response('not found', { status: 404 });
  const { size } = await stat(absolute);
  let start = 0, end = size - 1;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers: Record<string, string> = { 'Content-Type': mime[path.extname(source).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges':'bytes', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(createReadStream(absolute, { start, end })) as ReadableStream, { status: range ? 206 : 200, headers });
}
