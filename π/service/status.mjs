// Store the delivered wording and numbering together with the visible beat.
export function recentStatuses(store, count = 1) {
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('Choose 1 to 50 updates.');
  return (store.metadata.statusHistory ?? []).slice(-count).reverse();
}

function itemNumber(text) {
  const match = /^(?:(?:show|read)(?: me)?\s+)?#?(\d+)[.!?]?$/i.exec(text.trim());
  return match ? Number(match[1]) : null;
}

// Once the router decides this is a selection, bind an explicit numeral to
// the delivered list even if the model returned a differently ranked ID.
export function selectedThread(text, lastStatus, inferredId) {
  const number = itemNumber(text);
  return number === null ? inferredId : lastStatus?.open[number - 1]?.id;
}

export function isStatusCheck({ bubble, chatId, text }) {
  return Boolean(bubble && !chatId && typeof text === 'string' &&
    (!text.trim() || /^(?:status(?: update)?|what(?:’s|'s| is) open|list threads)[.!?]*$/i.test(text.trim())));
}

export function offlinePull(text, lastStatus) {
  const words = text.trim().replace(/[.!?]+$/, '');
  if (/^(?:yo|status(?: update)?|what(?:’s|'s| is) open|list threads)$/i.test(words)) return { action: 'check-in' };
  if (itemNumber(text) !== null && lastStatus) return { action: 'result', threadId: selectedThread(text, lastStatus) };
}

export function actionFor(t) {
  const actions = { queued: 'nothing needed yet', running: 'nothing needed yet', failed: 'read the error and decide whether to retry',
    interrupted: 'decide whether to resume', stopped: 'decide whether to resume', waiting_for_configuration: 'connect the model' };
  if (t.networkRequest) return 'network access is enabled. resume this task to continue.';
  if (t.status === 'waiting_for_you') return t.question || 'answer the question';
  return actions[t.status] || t.nextAction || 'read the result';
}

export { reportText } from './report-text.mjs';
