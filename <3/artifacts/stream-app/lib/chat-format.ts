import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const markdown = new Marked({ renderer: {
  html({ text }) { return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); },
  image({ text }) { return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); },
} });

export const linkPattern = /https?:\/\/[^\s<>"`]+|\bbeat\s+#?(\d+)\b/gi;

export function linkSpans(text: string) {
  const spans = [];
  for (const match of text.matchAll(linkPattern)) {
    let label = match[0];
    if (!match[1]) {
      label = label.replace(/[.,;:!?\]}]+$/, '');
      while (label.endsWith(')') && label.split(')').length > label.split('(').length) label = label.slice(0, -1);
    }
    const href = match[1] ? 'https://koopuluri.com/stream/' + match[1] : label;
    spans.push({ start: match.index!, end: match.index! + label.length, label, href });
  }
  return spans;
}
function linkify(root: DocumentFragment) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('a, code, pre')) continue;
    const text = node.data, spans = linkSpans(text);
    if (!spans.length) continue;
    const parts = document.createDocumentFragment();
    let end = 0;
    for (const span of spans) {
      parts.append(text.slice(end, span.start));
      const link = document.createElement('a'); link.href = span.href; link.textContent = span.label;
      parts.append(link); end = span.end;
    }
    parts.append(text.slice(end)); node.replaceWith(parts);
  }
}
export function messageBody(text: string, formatted: boolean) {
  const body = document.createDocumentFragment();
  if (formatted) {
    body.append(DOMPurify.sanitize(markdown.parse(text, { async: false }), {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'th', 'tr', 'td'],
      ALLOWED_ATTR: ['href', 'start'], ALLOWED_URI_REGEXP: /^https?:\/\//i,
    }));
  } else body.append(text);
  linkify(body);
  return body;
}
