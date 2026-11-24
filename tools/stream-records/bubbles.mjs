import fs from 'node:fs/promises';
import path from 'node:path';
import { readJSON } from './store.mjs';

function messageFields(chat, index) {
  const message = chat.messages[index];
  return { kind: 'bubble', chatId: chat.id, messageIndex: index, author: message.role === 'user' ? 'user' : 'π',
    bubble: { role: message.role, text: message.offeredText ?? message.text, source: message.source, reaction: message.reaction },
    appearedAt: message.at ?? null };
}

export function placeMessage(store, chat, index, after, inherit = {}) {
  const fields = messageFields(chat, index);
  const ref = `[chat with π](../../π/chats/${chat.id}.md)`;
  if (after == null) return store.insertBlock(ref, 'bubble', { ...inherit, ...fields });
  return store.insertBlockAfter(after, ref, 'bubble', { ...inherit, ...fields });
}

export function attachMessage(store, id, chat, index) {
  Object.assign(store.metadata.beats[id], messageFields(chat, index));
}

// Older transcripts can contain replies that were never inline bubbles.
// Only a turn submitted under the delivery protocol can owe a new bubble.
export function pendingReplies(store, chat) {
  // Retired bubbles count as delivered too.
  const shown = new Set(Object.values(store.metadata.beats).filter(b => b.chatId === chat.id && b.kind === 'bubble').map(b => b.messageIndex));
  const pending = [];
  let traceId;
  chat.messages.forEach((message, i) => {
    if (message.role === 'user') traceId = message.traceId;
    if (message.role === 'assistant' && (message.traceId || traceId) && !message.partial && !shown.has(i)) pending.push(i);
  });
  return pending;
}

export async function historicalChat(store, id) {
  if (!/^[\w-]+$/.test(id)) return null;
  const base = path.join(store.pi, 'chats', id);
  const chat = await readJSON(base + '.json', null);
  if (chat) return chat;
  // Published checkouts can contain only the readable transcript.
  let md;
  try { md = await fs.readFile(base + '.md', 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const messages = [];
  for (const match of md.replace(/\n$/, '').matchAll(/(?:^|\n\n)(?:\*\*you\*\*\n\n|> π: )([\s\S]*?)(?=\n\n(?:\*\*you\*\*\n\n|> π: )|$)/g)) {
    const user = match[0].trimStart().startsWith('**you**');
    messages.push({ role: user ? 'user' : 'assistant', text: user ? match[1] : match[1].replaceAll('\n> ', '\n') });
  }
  return { id, messages };
}

export async function expandHistoricalChats(store) {
  const records = [];
  for (const beat of store.snapshot().beats.filter(b => b.kind === 'chat' && b.chatId)) {
    const chat = await historicalChat(store, beat.chatId);
    if (chat?.messages.length) records.push({ beat, chat });
  }
  if (!records.length) return;
  await store.transact(() => {
    for (const { beat, chat } of records) {
      if (store.metadata.beats[beat.id]?.kind !== 'chat' || !store.beat(beat.id)) continue;
      attachMessage(store, beat.id, chat, 0);
      let after = beat.id;
      for (let i = 1; i < chat.messages.length; i++) after = placeMessage(store, chat, i, after, { redacted: beat.redacted });
    }
  });
}

export function recentPages(store, before = store.beats.length) {
  return [...new Set(store.snapshot().beats.slice(0, before).filter(b => b.kind === 'browser' && b.url).map(b => b.url).reverse())].slice(0, 24);
}

export function routePage(text, pages) {
  const target = text.replace(/^open\s+/i, '').trim();
  if (/^(?:https?:\/\/[^\s]+|(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?)$/i.test(target)) {
    try { const url = new URL(/^https?:/i.test(target) ? target : 'https://' + target); if (!url.username && !url.password) return url.href; } catch {}
  }
  const recall = /^open (?:the )?([\w-]+)(?: (?:site|website|page))?(?: again)?[.!]?$/i.exec(text);
  if (!recall) return null;
  const matches = pages.filter(page => new URL(page).hostname.toLowerCase().split('.').includes(recall[1].toLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}
