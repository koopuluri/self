/* Site adapter: only successful, explicitly allowlisted positive mutations.
 * No API credentials, background history imports, timeline snapshots or negative actions.
 * This pure portion is also exercised by the Node fixture tests. */
(function (root) {
  'use strict';
  const hosts = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
  const xURL = value => { try { return hosts.has(new URL(value).hostname); } catch { return false; } };
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
  const str = value => typeof value === 'string' ? value : '';
  function operation(url, method = 'POST') {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (method.toUpperCase() !== 'POST' || !(hosts.has(parsed.hostname) || ['api.x.com', 'api.twitter.com'].includes(parsed.hostname))) return null;
    const path = parsed.pathname;
    if (/\/FavoriteTweet$/.test(path)) return 'like';
    if (/\/Create(?:Note)?Tweet$/.test(path)) return 'publish';
    if (/\/friendships\/create\.json$/.test(path)) return 'follow';
    return null;
  }
  function variables(body) {
    const parsed = parse(body);
    if (parsed && typeof parsed === 'object') return parse(parsed.variables) || parsed;
    if (typeof body === 'string') return Object.fromEntries(new URLSearchParams(body));
    return {};
  }
  function unwrap(result) {
    if (!result) return null;
    return result.tweet || result;
  }
  function user(result) {
    result = result || {};
    return { id: str(result.rest_id || result.id_str), handle: str(result.core?.screen_name || result.legacy?.screen_name || result.screen_name), name: str(result.core?.name || result.legacy?.name || result.name) };
  }
  function normalize({ url, method, body, response, status, context = {} }) {
    const op = operation(url, method);
    if (!op || status < 200 || status >= 300) return null;
    const json = parse(response), vars = variables(body);
    if (!json || json.errors?.length || json.error) return null;
    const common = { platform: 'x', source_url: context.source_url || '', verification: 'successful_site_response' };
    if (op === 'like') {
      const result = json.data?.favorite_tweet;
      const id = str(vars.tweet_id);
      if (!/^\d+$/.test(id) || (result !== 'Done' && result !== true)) return null;
      return { type: 'post.liked', fields: { ...common, post_id: id, url: context.post?.url || `https://x.com/i/status/${id}`, author: context.post?.author || null, content_capture: context.post?.text ? 'visible_post' : 'unavailable', media: context.post?.media || [] }, text: context.post?.text || null };
    }
    if (op === 'follow') {
      const account = user(json);
      if (!account.id || !account.handle || json.following !== true) return null;
      return { type: 'account.followed', fields: { ...common, account, url: `https://x.com/${account.handle}` } };
    }
    const result = unwrap(json.data?.create_tweet?.tweet_results?.result || json.data?.create_note_tweet?.tweet_results?.result);
    const id = str(result?.rest_id || result?.legacy?.id_str);
    if (!/^\d+$/.test(id)) return null;
    const author = user(result.core?.user_results?.result);
    const legacy = result.legacy || {};
    const replyID = str(legacy.in_reply_to_status_id_str || vars.reply?.in_reply_to_tweet_id);
    const text = result.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || vars.tweet_text;
    if (typeof text !== 'string') return null;
    const media = (legacy.extended_entities?.media || legacy.entities?.media || []).map(m => ({ type: m.type, url: m.media_url_https, expanded_url: m.expanded_url, alt: m.ext_alt_text || null })).slice(0, 16);
    return { type: replyID ? 'reply.published' : 'post.published', fields: { ...common, post_id: id, url: `https://x.com/${author.handle || 'i'}/status/${id}`, author, reply_to_post_id: replyID || null, reply_to_url: replyID ? `https://x.com/i/status/${replyID}` : null, quoted_post_url: vars.attachment_url || null, media, content_capture: 'published_response' }, text };
  }
  function navigation(url, source) {
    let target, from;
    try { target = new URL(url); from = source ? new URL(source) : null; } catch { return {}; }
    if (!xURL(url)) return {};
    const following = target.pathname.match(/^\/([A-Za-z0-9_]+)\/following\/?$/);
    if (following) return { context: 'x.following_list', list_owner: following[1] };
    const owner = from && xURL(source) && from.pathname.match(/^\/([A-Za-z0-9_]+)\/following\/?$/);
    const profile = target.pathname.match(/^\/([A-Za-z0-9_]+)\/?$/);
    const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose', 'search', 'login', 'logout', 'tos', 'privacy']);
    if (owner && profile && !reserved.has(profile[1].toLowerCase())) return { context: 'x.profile_from_following_list', list_owner: owner[1], account_handle: profile[1] };
    return {};
  }
  const adapter = { operation, variables, normalize, navigation, xURL };
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
  else root.GhostXAdapter = adapter;
})(globalThis);
