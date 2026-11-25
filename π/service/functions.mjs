import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { modelCall } from './model-call.mjs';
import { actionFor, recentStatuses, selectedThread } from './status.mjs';
import { atomicWrite, readJSON, stamp } from './io.mjs';

export function sharedWorkspaceRoot() {
  return process.env.PI_WORKSPACE_SOURCE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

export async function eventLog(agent, event) {
  await fs.appendFile(path.join(agent.store.pi, 'logs/events.jsonl'), JSON.stringify({ at: stamp(), ...event }) + '\n', { mode: 0o600 });
}

export function functionConfig(config, tier = 'easy') {
  const override = config.tiers?.[config.provider]?.[tier];
  if (override) return { ...config, ...override };
  if (config.provider !== 'chatgpt' || !/^gpt-6\.2-(astra|sol)$/.test(config.model)) return config;
  return { ...config, model: tier === 'easy' ? 'gpt-6.2-sol' : 'gpt-6.2-astra',
    reasoning: { easy: 'medium', medium: 'high', hard: 'xhigh' }[tier] };
}

async function judgment(agent, name, config, data, format, link, signal) {
  const prompt = await fs.readFile(path.join(agent.skillsRoot, name, 'SKILL.md'), 'utf8');
  const settings = functionConfig(config);
  const result = await modelCall(agent, settings, agent.model(settings), {
    systemPrompt: prompt + '\nReturn only one JSON object with this contract.\n' + format,
    messages: [{ role: 'user', content: JSON.stringify(data), timestamp: Date.now() }],
  }, signal, { ...link, function: name });
  const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('');
  return JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ''));
}

function indexEntry(thread) {
  return { id: thread.id, title: thread.title, summary: thread.summary ?? '', state: thread.status,
    sourceBeatId: thread.sourceBeatId, queued: thread.inbox?.map(q => q.message.content) };
}

export function beatContext(beats) {
  return beats.map(b => ({ id: b.id, kind: b.kind, text: b.bubble?.text ?? b.text }));
}

export async function processMessage(agent, config, text, beats, link, lastStatus) {
  const open = (await agent.trackedThreads()).filter(t => t.lifecycle !== 'archived');
  const threads = open.map(indexEntry);
  const data = { message: text, beats, threads, lastStatus };
  const callId = randomUUID();
  const decision = await judgment(agent, 'process-message', config, data,
    '{"action":"new|resume|steer|follow-up|abort|check-in|result|status-history|open-page","threadId":string|null,"beatIds":number[],"tier":"easy|medium|hard","title":string,"count"?:number,"url"?:string}. For result choose the thread ID from the delivered list or open tasks, or null if unclear. For status-history supply count (1 to 50). For open-page supply an explicit or confidently resolved http(s) URL.', { ...link, callId }, new AbortController().signal);
  const taskActions = ['resume','steer','follow-up','abort'];
  const known = open.some(t => t.id === decision?.threadId);
  const fromStatus = lastStatus?.open.some(t => t.id === decision?.threadId);
  // Reading a result can archive its thread while the delivered list still names it.
  if (!known && fromStatus && ['follow-up', 'steer'].includes(decision.action)) decision.action = 'resume';
  if (!decision || ![...taskActions,'new','result','check-in','status-history','open-page'].includes(decision.action)
    || !['easy','medium','hard'].includes(decision.tier) || !Array.isArray(decision.beatIds) || typeof decision.title !== 'string'
    || (taskActions.includes(decision.action) && !known && !(decision.action === 'resume' && fromStatus))) throw new Error('π returned an invalid routing decision.');
  if (decision.action === 'result') {
    decision.threadId = selectedThread(text, lastStatus, known || fromStatus ? decision.threadId : null);
  }
  if (decision.action === 'status-history' && !(Number.isInteger(decision.count) && decision.count >= 1 && decision.count <= 50)) decision.count = 1;
  if (decision.action === 'open-page') {
    const url = new URL(decision.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid page URL.');
  }
  return { ...decision, callId, context: beats.filter(b => decision.beatIds.includes(b.id)) };
}

// Only this task's compact card can change. There is no delivery decision here.
export async function organizeThreads(agent, job, outcome) {
  const { thread } = job;
  const link = { traceId: job.traceId, triggerThreadId: thread.id, triggerCallId: job.taskCallId };
  const messages = job.chat.messages;
  const ask = messages.findLastIndex(m => m.role === 'user' && m.traceId === job.traceId);
  const exchange = ask < 0 ? [] : messages.slice(Math.max(0, ask - 4), ask + 1)
    .map(({ role, text }) => ({ role, text: text.slice(0, 6000) }));
  const card = await judgment(agent, 'update-thread', job.config, { task: indexEntry(thread),
    previous_human_context: thread.human_context ?? '', exchange,
    context: (thread.context ?? []).slice(-5).map(({ text }) => text?.slice(0, 2400)), outcome },
    '{"title":string,"summary":string,"human_context":string,"nextAction":string}', link, job.controller.signal);
  if (![card.title, card.summary, card.nextAction].every(v => typeof v === 'string')) throw new Error('Invalid thread card');
  job.controller.signal.throwIfAborted();
  if (thread.inbox?.length) return;
  thread.title = card.title.trim() || thread.title;
  thread.summary = card.summary;
  if (ask >= 0 && typeof card.human_context === 'string' && card.human_context.trim()) {
    thread.human_context = card.human_context.trim();
    thread.humanContextTraceId = job.traceId;
  }
  thread.nextAction = card.nextAction;
  await agent.saveThread(thread);
  await eventLog(agent, { ...link, function: 'update-thread', affectedThreadIds: [thread.id] });
}

function applyRanking(open, ranking) {
  const remaining = new Map(open.map(card => [card.id, card]));
  const cards = [];
  for (const row of ranking) {
    const card = remaining.get(row.id);
    if (!card) continue;
    // A changed thread keeps its current title, state and next action.
    const sameCard = row.input === JSON.stringify(card);
    cards.push(sameCard && row.action ? { ...card, action: row.action } : card);
    remaining.delete(row.id);
  }
  return [...cards, ...remaining.values()];
}

async function statusCards(agent) {
  const threads = await agent.trackedThreads();
  const open = threads.filter(t => t.lifecycle !== 'archived').map(t => ({ id: t.id, title: t.title,
    chatId: t.chatId, human_context: t.human_context, humanContextTraceId: t.humanContextTraceId, summary: t.summary || '', state: t.status, progress: t.progress, action: actionFor(t) }));
  const closed = threads.flatMap(t => t.closures ?? []).filter(c => !agent.store.metadata.reportedClosures?.[c.closureId]);
  return { open, closed };
}

const rankingFile = agent => path.join(agent.store.pi, '.runtime/status-ranking.json');

export async function refreshStatusRanking(agent) {
  const { open, closed } = await statusCards(agent);
  if (!open.length) {
    await fs.rm(rankingFile(agent), { force: true });
    return;
  }
  const config = await agent.status();
  if (!config.ready) return;
  const key = createHash('sha256').update(JSON.stringify([...open].sort((a,b) => a.id.localeCompare(b.id)))).digest('hex');
  const file = rankingFile(agent);
  if ((await readJSON(file, null))?.key === key) return;
  const data = { open, closed, previous: recentStatuses(agent.store, 1)[0]?.text };
  const advice = await judgment(agent, 'compose-status', config, data,
    '{"open":[{"id":string,"action":string}]}. Return each supplied open ID once in descending priority.', {traceId:randomUUID()}, new AbortController().signal);
  const cards = new Map(open.map(card => [card.id, card]));
  const ranking = advice.open.filter(row => cards.has(row.id)).map(row => ({
    id: row.id, input: JSON.stringify(cards.get(row.id)), action: typeof row.action === 'string' ? row.action.trim() : '',
  }));
  await atomicWrite(file, JSON.stringify({key, ranking}));
}

export async function composeStatus(agent) {
  const { open, closed } = await statusCards(agent);
  const cache = await readJSON(rankingFile(agent), null);
  const ranking = cache?.ranking ?? recentStatuses(agent.store, 1)[0]?.open ?? [];
  return { open: applyRanking(open, ranking), closed };
}
