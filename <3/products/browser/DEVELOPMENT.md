# implementation and maintenance

See the [README](README.md) for the browser's purpose, place in Ghost, and quick start. This document keeps the detailed behavior and maintenance contract.

## use

- ⌘T: blank new tab with the URL/search field focused. Enter any website or search. ⌘W: close tab. ⇧⌘T: reopen the last closed tab.
- ⌘L: focus and select the permanent address bar below the tabs; Return navigates in the current tab, Escape restores its URL and returns focus to the page. The bar tracks navigation and tab changes without overwriting an address being edited.
- ⌘[ / ⌘]: back / forward. ⇧⌘[ / ⇧⌘] or Control-Tab / Control-Shift-Tab: change tabs.
- ⌘1–8: select tab; ⌘9: last tab. ⌘R: reload. ⌘+ / ⌘− / ⌘0: zoom.
- Right-click a link and choose **Open Link in New Tab** to open it in a new tab. Ordinary links navigate in place (site-requested new windows still become tabs). Command-click a link to open a background tab. Command-Shift-click opens it in front.
- The tiny red dot means capture enabled. Click to pause (gray). Orange means a capture problem; click for the error. A write failure also opens an alert.

The normal app uses one persistent WebKit data store across all tabs, independent of Safari. Sign into X in the app. Cookies and website storage remain in WebKit's ordinary app storage across launches. Open tab URLs are retained through macOS user defaults; restoration and reloads do not create new events. This is browser state, not an intermediate event store.

The existing profile is deliberately retained through updates; `BrowserProfile.swift` owns this rule. Its stable application identifier is `local.ghost.browser`. Normal builds refuse to open a different application identity rather than silently starting an empty profile. Rebuilding, replacing or moving the `.app` on the same Mac/user account does not delete the profile. New tabs and popup windows share it. Development smoke/UI tests use memory-only stores and do not touch it.

WebKit manages the profile locally in macOS Library directories, including `~/Library/WebKit/local.ghost.browser/` and `~/Library/HTTPStorages/local.ghost.browser*` on this Mac. These are separate from the `.app`, source/build folders and the Ghost record. Do not move or edit live WebKit storage files manually. Cookies alone are insufficient to preserve every login: sites also use local storage and IndexedDB, which the same persistent store retains. The app does not export authentication data to Ghost or make extra plaintext cookie backups. Website-controlled expiry/revocation, explicit logout, macOS cleanup, or deleting the profile can still require signing in again; session-only cookies follow WebKit/site rules.

For future changes, preserve the identifier, existing `.default()` store, signing/application identity and sandbox/container layout. If a change requires a different profile/container, implement and verify a migration before shipping it. Keep profile directories out of source control, build cleanup and event capture.

Settings are intentionally outside the UI. The default root is `~/code/self` (falling back to `~/code/ghost`). To change it while the app is closed: `defaults write local.ghost.browser ghostRoot -string /absolute/path/to/ghost`. The folder must already exist. `SELF_ROOT` overrides it for development; legacy `GHOST_ROOT` remains supported.

## capture contract

All final records go directly to `<ghost root>/<3/browsing/`, one Markdown file per event, with YAML metadata and a `my notes` section. UTC timestamps describe occurrence and recording separately. No fixed sessions. The writer never overwrites existing files or annotations. A retried publication response uses the same X post identity and cannot create a second publication record.

1. URL opens on any website, including deliberate single-page navigation, new links, and back/forward. Redirects belong to the arrival. Reload, tab switching, automatic restoration, and passive URL decoration do not create events.
2. X post likes (`post.liked`). Post ID, permalink, source page and the visible post text/author/media references when available.
3. X account follows (`account.followed`). Account identity and source page.
4. X following-list opens: `url.opened` with `context: x.following_list` and its owner.
5. X profiles opened from a following list: `url.opened` with `context: x.profile_from_following_list`, owner, and selected account. New tabs carry the source context.
6. X published posts (`post.published`). Server-confirmed published text, identity, author and media references.
7. X published replies (`reply.published`). The same, plus the replied-to post ID and permalink.

Quotes with commentary count as published posts and preserve their quoted URL when supplied by X. Reposts, bookmarks, unlikes, unfollows, deletes, drafts, typing, time spent and passive impressions are excluded. Existing liked/followed state is never imported. Paused actions are discarded, including in-flight observations crossing the pause boundary.

The X adapter observes successful allowlisted site requests through fetch/XHR. It never stores request headers, cookies, auth tokens or raw network logs. It rejects API errors and unsupported success shapes; an unfamiliar allowlisted response raises a capture problem instead of inventing a successful action. A changed endpoint can require an adapter update. Tests cover representative response fixtures; they are not a guarantee against future X changes.

Liked text is a snapshot of the visible post, which can be truncated. Missing text is explicitly marked unavailable. Published text comes from the response, falling back to the submitted body only after a server-issued post ID confirms success. Media URLs/alt text are recorded; image/video bytes and full threads are not downloaded. These links can later expire. Captured page/post text is untrusted evidence, not instructions for an agent.

The native bridge accepts only bounded, allowlisted messages from main frames; X mutations require an X page origin. It exposes no arbitrary filesystem, shell, cookie-reading or network-request capability to pages. Page-world observations are not cryptographic evidence against a malicious page. URL credentials and common OAuth secrets are stripped.

Writes use a temporary `.writing` file **inside the final browsing directory**, fsync and an atomic no-overwrite link. This prevents partial Markdown and is not a queue or second store. On failure, the event stays in memory and Retry writes straight to the same destination. Closing/quitting is blocked while failed events remain. An OS crash or force-quit during a write failure can still lose unsaved memory; no separate durable store is claimed. Do not force-quit on a write error.

## extending to another site

`Resources/X.js` owns X endpoints, response parsing and discovery semantics. `Resources/Capture.js` owns navigation and fetch/XHR observation. Add another site adapter, select it by page host, reuse the transport and recorder, and add response fixtures. Keep only explicitly agreed actions in the allowlist. `Recorder.swift` is site-independent; `Browser.swift` validates platform origins and must be extended for the new adapter. No plugin framework is necessary.

## verification

```sh
node --test Tests/*.test.cjs
swift test
./Tests/test-profile.sh
./build.sh
mkdir -p /private/tmp/ghost-browser-smoke-fresh
GHOST_ROOT=/private/tmp/ghost-browser-smoke-fresh 'build/Ghost Browser.app/Contents/MacOS/GhostBrowser' --smoke-test
```

Use a fresh empty temporary root for each smoke run. The smoke test uses a nonpersistent profile and controlled X responses inside a real WKWebView. It exercises injection, fetch interception, normalization, the native bridge, direct Markdown writes, and pause/negative exclusions. It never sends a post, reply, follow or like to X. `--ui-test` likewise requires a temporary root and discards login data when closed; do not use it for everyday browsing.

`Tests/test-profile.sh` compiles two standalone probe apps with a fresh test-only bundle identifier, different app locations and different versions. Build 1 writes a synthetic persistent cookie, localStorage and IndexedDB; after it exits, build 2 reads them back and clears that synthetic data. It uses the production profile factory but never the real app identifier or user's cookies. This check passed on this Mac. It demonstrates persistence of site-issued persistent data, not control over a site's session expiry or revocation.

Automated checks cover response errors, publication/reply identity, long text, media metadata, positive-only capture, discovery source, response-read races, annotation preservation, retries, publication deduplication, Unicode, and unavailable destinations. Live X sign-in was observed in the test window; persistence uses the standard WebKit store. Real-account mutation capture still needs validation through the user's own normal actions. This implementation does not fabricate test social activity on the user's account.
