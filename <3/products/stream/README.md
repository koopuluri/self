# stream

A local desktop stream for writing, browsing, media, and conversations with π.

Open `build/stream.app`. It loads the app from this checkout, so a rebuilt interface is available on reload (⌘R). No distribution service, website, or sync is involved.

## Use

- Write naturally. Enter finishes a beat and moves forward. Earlier prose remains editable.
- Beat IDs begin at zero and never change. Clearing text preserves its slot. There is no saved text revision history; ordinary editor undo is session-local.
- Scroll back to see the fixed composer. It writes the next beat at the end while preserving your reading position. The displayed beat number supplies context for “π, redact this”.
- Write `π, ...` and press Enter to start work. A chat appears when typing pauses. Enter from the preceding writing slot enters it; Enter on an empty chat input leaves it. Shift-Enter makes a newline inside chat.
- Drop files or use ＋. The original is copied byte-for-byte into the shared assets directory, and displayed inline. HEIC/MOV previews are derived separately when local conversion tools are available.
- Use ↗ to open a browser beat. A clicked page link creates a new beat. ⌘Enter returns to writing. One live browser surface is kept at a time; historic pages reopen when expanded.
- The small beat-number button shows timestamps, source provenance, and a clear-beat action. ⌘F searches stream text; chat bodies are stored separately.

## Records

- `<3/stream/stream.md`: current text and ordered references, with `<!-- beat:N -->` markers. This file is authoritative.
- `<3/stream/metadata.json`: timestamps, source references, redaction flags, block data, focus visits. Unknown times remain null.
- `<3/assets/`: preserved media originals.
- `π/chats/`: conversation JSON and readable Markdown.
- `π/threads/`: resumable model context, objective, status, tool results.
- `π/memory/`: ordinary Markdown memory files created by π as requested.
- `π/logs/model-calls.jsonl`: one record per model call, including provider/model, timings, token usage, cache usage, and reported or estimated cost. A cost estimate is not a billing receipt.
- `π/.runtime/`: browser profile, chat drafts, pending chat offers, derived media previews.

Direct edits to valid beat lines in stream.md are detected. Preserve the beat markers and their order. Removing a marker leaves its ID allocated. Malformed files and conflicting concurrent edits block overwriting and show an error; copy any unsaved app text before reloading. No silent conflict resolution or remote synchronization is implemented.

The historical import reads the Nov 12–19 notes without editing them. Each nonempty source line becomes a beat and retains its source file and line. Original creation/focus timestamps are unknown. Importing does not invoke a model.

## Models and work

The Electron renderer has no Node access. A separate local utility process owns records and coordinates up to two independent work threads. It survives interface reloads; quitting the app stops execution. Interrupted work resumes explicitly through a fresh chat, without blindly replaying actions.

The model layer uses `@earendil-works/pi-ai`, independently of Codex or Claude app-server. OpenAI, Anthropic, Google, and OpenRouter API credentials are read from the launch environment; they are never written into the workspace or sent to the renderer. Select a model with the π button. The initial model is OpenAI `gpt-5.4-mini`.

Model work starts on an explicit `π` beat or a chat reply. Continuous autonomous interpretation of every prose beat is not enabled in this first build. Tools support reading beats/files, redacting on request, opening a page, creating memory, editing this app's source, running checks, and asking the user a question. `ask_user` yields the run until a reply arrives. Tool execution is local and is not an OS security sandbox.

Subscription OAuth is not wired yet. OpenAI documents a supported ChatGPT-plan flow for locally hosted apps. Claude subscription use goes through unmodified Claude Code; this independent provider layer uses API authentication.

## Develop

Install Node 24 LTS (minimum 22.19), then run these commands from `<3/products/stream/`. Use the committed lockfile:

```sh
npm ci
npx --no-install install-electron
npm run dev
```

The development launcher starts Next.js on loopback port 3456 and then Electron. UI edits use Fast Refresh. For the standalone local app:

```sh
npm run check
npm test
npm run build
npm run package
open build/stream.app
```

`PI_SELF_ROOT` selects another data root, including isolated test fixtures. The package is a locally signed Mac launcher tied to this checkout; it is not a distributable installer. Browser state and model sessions are kept separate from generated app builds.

## New laptop

Clone `https://github.com/koopuluri/self.git`, then follow Develop above to install dependencies and build the app. The current stream, beat metadata, original notes, and source come with Git. Shared assets, browser logins, local threads/logs, and API credentials do not. Media references remain in the stream and will work after the original files are copied into the same workspace-relative locations. Do not re-import the notes: the imported stream is already present.

The packaged app uses its own Electron runtime for π's checks, so it does not depend on the previous laptop's Node path. For MOV previews, install ffmpeg in `/opt/homebrew/bin/ffmpeg` or set `PI_FFMPEG_BINARY`. HEIC conversion uses macOS's built-in `sips`. Launch from an environment containing the provider API key when using models; credentials are never committed.
