# ghost browser

Ghost Browser brings everyday browsing into [Ghost](../../../README.md). It records selected actions as readable, timestamped evidence alongside your writing, chats, and deliberate captures, so AI functions can connect what you explore, like, follow, and publish with the rest of your context.

The browser is the capture tool; Ghost holds the record. Events go straight to `self/<3/browsing/`, one Markdown file per event, with source context and room for your notes. There is no intermediate event database or sync step. Existing records and annotations are never rewritten, and activity has timestamps without fixed session boundaries.

## what it captures

- URLs opened on any website.
- X post likes and account follows.
- X following lists opened, and profiles opened from those lists, preserving who led you to whom.
- Posts and replies published on X, including those composed directly on the site.

Social actions require a successful site response. No unlikes, unfollows, drafts, keystrokes, or passive impressions are recorded. Opening a page does not imply endorsement. X is the first social adapter; other sites can reuse the same capture and recording path.

## everyday use

Webpages, tabs, an address bar, and a small capture indicator. Back and forward arrows at the top left navigate the current tab’s history and dim when unavailable. The address bar shows the current tab’s full URL: copy it, paste another address, or edit it and press Return to navigate in the same tab. Right-click a link and choose **Open Link in New Tab** to keep the source page open. New tabs open blank and accept any URL or search. Settings are managed outside the app through your AI assistant or local configuration.

| Shortcut | Action |
| --- | --- |
| ⌘T / ⌘W / ⇧⌘T | Open / close / reopen a tab |
| ⌘L | Focus and select the address bar |
| ⌘[ / ⌘] | Back / forward |
| Control-Tab / Control-Shift-Tab | Next / previous tab |
| ⌘R | Reload |

The capture dot is red while recording, gray while paused, and orange when something needs attention. Click it to pause, resume, or inspect an error.

Cookies and website storage persist locally across quits and rebuilds, separately from Ghost. Keep the app's identity and profile stable when updating it; sites can still expire or revoke a login.

## run

Requires macOS 14+ and Xcode's Swift toolchain to build. Swift + WebKit; no third-party packages or server.

```sh
./build.sh
open "build/Ghost Browser.app"
```

The default destination is `~/code/self`, with a fallback to `~/code/ghost` for existing installations. The folder must already exist. See [implementation and maintenance](DEVELOPMENT.md) for configuration, the exact capture contract, adding a site, and verification. [AGENTS.md](AGENTS.md) records the profile-preservation rules for future changes.
