import { readdirSync, readFileSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const workspaceRoot = path.resolve(process.cwd(), '../../..');
const excluded = new Set(['node_modules', '.next', '.git', '.ghost', '.obsidian', '.vercel', '.venv', '.build', 'build', 'out', 'dist', 'coverage', '__pycache__', 'vendor']);
const textExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.py', '.swift', '.sh', '.command', '.toml', '.yaml', '.yml', '.html', '.lock']);
const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.mp4', '.mov', '.webm', '.m4v', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.pdf', '.blend', '.ttf', '.woff2']);
export const encodePath = value => '/' + value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
export function canonicalPath(source) {
  if (source === 'README.md') return '/';
  if (source.endsWith('/README.md')) return encodePath(source.slice(0, -10));
  if (/^<3\/essays\/[^/]+\.md$/.test(source)) return encodePath(path.posix.basename(source, '.md'));
  return encodePath(source.replace(/\.md$/, ''));
}

// Public workspace content, not the entire host filesystem. No symlinks or runtime state.
const inventories = new Map();
export function inventory(root = workspaceRoot) {
  if (process.env.NODE_ENV === 'production' && inventories.has(root)) return inventories.get(root);
  const files = new Map();
  const directories = new Set(['']);
  const walk = relative => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = entry.name;
      if (excluded.has(name) || (name.startsWith('.') && !(relative === '' && name === '.agents'))) continue;
      if (/\.(?:pem|key|p12|pfx|tsbuildinfo)$/.test(name) || /^(?:credentials|secrets)(?:\.|$)/i.test(name)) continue;
      const source = relative ? `${relative}/${name}` : name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { directories.add(source); walk(source); }
      else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (textExtensions.has(ext) || mediaExtensions.has(ext)) files.set(source, { source, kind: textExtensions.has(ext) ? 'text' : 'media' });
      }
    }
  };
  // Only these roots form the public collection. New categories beneath them are automatic.
  for (const name of ['<3', 'π', '$', 'tools', '.agents']) {
    const absolute = path.join(root, name);
    if (existsSync(absolute) && !lstatSync(absolute).isSymbolicLink()) { directories.add(name); walk(name); }
  }
  for (const name of ['README.md', 'AGENTS.md', 'ghost.publish.json', 'vercel.json']) {
    if (existsSync(path.join(root, name)) && !lstatSync(path.join(root, name)).isSymbolicLink()) files.set(name, { source: name, kind: 'text' });
  }
  const result = { files, directories };
  if (process.env.NODE_ENV === 'production') inventories.set(root, result);
  return result;
}

export function readDocument(source, root = workspaceRoot) {
  const entry = inventory(root).files.get(source);
  if (!entry || entry.kind !== 'text') return null;
  const absolute = realpathSync(path.join(root, source));
  if (!absolute.startsWith(realpathSync(root) + path.sep)) return null;
  const raw = readFileSync(absolute, 'utf8');
  if (!source.endsWith('.md')) return { source, title: path.basename(source), markdown: '', code: raw, date: undefined };
  // Browsing records have rich YAML metadata; it is displayed, never executed.
  const { data, content } = matter(raw);
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : content.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(source, '.md');
  return { source, title, markdown: content, code: undefined, date: typeof data.date === 'string' ? data.date : undefined };
}

export function essaySources(root = workspaceRoot) {
  return [...inventory(root).files.keys()].filter(source => /^<3\/essays\/[^/]+\.md$/.test(source) && !source.endsWith('/README.md'));
}

// Historical transcripts keep their original paths and wording.
function relocatedPath(source) {
  const exact = { 'expression/essays/design-principles.md': '<3/essays/principles.md' };
  if (exact[source]) return exact[source];
  for (const [old, current] of [
    ['expression/personal-site/', '<3/products/personal-site/'],
    ['ghost-tools/browser/', '<3/products/browser/'],
    ['expression/essays/', '<3/essays/'], ['expression/videos/', '<3/videos/'],
    ['events/chats/', '<3/chats/'], ['events/browsing/', '<3/browsing/'],
    ['assets/', '<3/assets/'], ['ghost-tools/', 'tools/'], ['expression/', '<3/notes/'],
  ]) if (source.startsWith(old)) return current + source.slice(old.length);
  return source;
}

export function resolveLink(source, href, root = workspaceRoot) {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return href;
  const [pathname, suffix = ''] = href.split(/(?=[?#])/s, 2);
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return href; }
  const original = source.replace(/^<3\/chats\//, 'events/chats/').replace(/^<3\/videos\//, 'expression/videos/');
  const absolute = decoded.replace(/^\/Users\/[^/]+\/code\/(?:ghost|self)\//, '/');
  const target = (absolute.startsWith('/') ? absolute.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(source), absolute))).replace(/\/$/, '');
  const historical = absolute.startsWith('/') ? absolute.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(original), absolute));
  const { files, directories } = inventory(root);
  for (const candidate of [target, relocatedPath(target), relocatedPath(historical)]) {
    if (files.has(candidate)) return canonicalPath(candidate) + suffix;
    if (files.has(candidate + '.md')) return canonicalPath(candidate + '.md') + suffix;
    if (directories.has(candidate)) return encodePath(candidate) + suffix;
  }
  return href;
}

export function wikiTarget(source, target, root = workspaceRoot) {
  const { files } = inventory(root);
  const local = path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  for (const item of [local, local + '.md', target, target + '.md', relocatedPath(target), relocatedPath(target + '.md'), '<3/assets/' + target]) if (files.has(item)) return item;
  const matches = [...files.keys()].filter(item => path.posix.basename(item) === target || path.posix.basename(item, '.md') === target);
  return matches.length === 1 ? matches[0] : null;
}

export function mediaURL(source) {
  const origin = process.env.NEXT_PUBLIC_SELF_MEDIA_ORIGIN;
  if (source.startsWith('<3/products/personal-site/public/')) return encodePath(source.slice('<3/products/personal-site/public/'.length));
  return origin && source.startsWith('<3/assets/') ? origin.replace(/\/$/, '') + encodePath(source) : '/api/files' + encodePath(source);
}

export function prepareMarkdown(source, markdown, root = workspaceRoot) {
  return markdown.replace(/(!?)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_all, embed, target, anchor, label) => {
    const found = wikiTarget(source, target, root);
    if (!found) return label || target;
    const href = (embed && !found.endsWith('.md') ? mediaURL(found) : canonicalPath(found)) + (anchor ? '#' + anchor.toLowerCase().replace(/\s+/g, '-') : '');
    const name = label && !/^\d+(?:x\d+)?$/.test(label) ? label : target;
    if (embed && /\.(png|jpe?g|gif|webp|svg)$/i.test(found)) return `![${name}](${href})`;
    if (embed && /\.(mp4|webm|mov)$/i.test(found)) return `[${name}](${href} "video")`;
    if (embed && /\.(mp3|wav|m4a|ogg)$/i.test(found)) return `[${name}](${href} "audio")`;
    return `[${name}](${href})`;
  });
}

export function pageEntries(root = workspaceRoot) {
  const { files, directories } = inventory(root);
  const routes = new Map();
  for (const directory of directories) if (directory) routes.set(encodePath(directory), { source: files.has(directory + '/README.md') ? directory + '/README.md' : directory, directory: true });
  for (const [source, entry] of files) {
    if (source.endsWith('/README.md') || source === 'README.md' || /^<3\/essays\/[^/]+\.md$/.test(source)) continue;
    const url = canonicalPath(source);
    if (routes.has(url)) throw new Error(`Workspace route collision: ${source}`);
    routes.set(url, { ...entry, directory: false });
  }
  return routes;
}
