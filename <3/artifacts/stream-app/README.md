# stream

A local desktop stream for writing, browsing, media, and conversations with π.

Open `~/Desktop/stream.app` for real writing. Open `~/Desktop/Stream Preview.app` to try changes on a separate copy. Each app pins one release, including its renderer, record editor and dependencies, for the lifetime of its process. Reloading the window keeps the same release.

## Use

- In the document editor, Enter splits at the cursor and Backspace joins adjacent beats at their boundary. Paste inserts at the selection. Repeated line breaks from Notes count as one. Option-Up/Down moves the current beat or selected beats.
- The left side of a split keeps its ID; inserting whole lines before existing text keeps the existing passage's ID with its text. Joining keeps links to both passages. Deleting a whole selected passage retires its ID. Undo and redo work during the editing session.
- ⌘⇧C copies the focused beat's permalink. In the stream, `/open https://koopuluri.com/stream/9023` opens the passage locally or reports a deleted/unknown ID. Public web serving is deferred.
- Scroll back until the latest beat leaves view. Click the down arrow in the bottom-right corner to return to it and keep writing.
- Type `/` on an empty beat to write to π. Enter sends and leaves the caret in the next writing beat. Shift-Enter adds a line inside the bubble. Backspace on an empty bubble returns to prose. π routes each message by meaning and can resume, steer, queue a follow-up, or stop a task.
- Sending an empty bubble records an empty message and asks π for status. You can also ask in your own words. The reply lists every open thread in priority order with what it needs from you, plus newly completed and closed work. Say “1”, “show me the first one”, or name the lesson to read a result. The numbering belongs to the update you saw. Asking for previous updates retrieves their delivered wording.
- Background results, questions, and research stay in the thread. Stream places an invited reply below the request while its writing slot is available. Writing into the slot withdraws the invitation. Status history records the update when it appears. Explicit requests to open pages still create browser beats. Existing chat references expand in place, retaining the original beat ID and source transcript.
- Drop files into the stream. The original is copied byte-for-byte into the shared assets directory, and displayed inline. Click an image to expand it, click again to zoom, and use Escape or × to close. Videos have native playback and fullscreen controls. HEIC/MOV previews are derived separately when local conversion tools are available.
- Write `/example.com` to open a browser beat immediately. Explicit URLs and unambiguous requests such as `/open example again` resolve locally. Other requests use the selected model with recent browser history and the five preceding nonempty beats captured at send time. Reopening a browser beat records a fresh visit at the end of the stream and opens the page in the window-sized viewer. Each subsequent navigation, including Back and Forward, appends another visit. Close the viewer with ×, Escape, or ⌘Enter.
- Write `/open <3/artifacts/principles.md` to edit a workspace document in CodeMirror. Edits save to the file, and closing flushes pending changes. Browser and document beats show a compact URL or filepath you can reopen. Preview seeds separate copies of single-file artifacts.
- ⌘F searches stream text. Chat transcripts remain in π/chats. Ask π what is open or describe the thread you want to continue.

## Records

- `<3/stream/index.md`: current text and ordered references, with `<!-- beat:N -->` markers. This file is authoritative.
- `<3/stream/metadata.json`: timestamps, source references, redaction flags, block data, focus visits. Unknown times remain null.
- `<3/stream/assets/`: preserved media originals.
- `π/chats/`: conversation JSON and readable Markdown.
- `π/threads/`: one resumable Pi session per task, including its open or archived status and compaction checkpoints.
- The stream metadata journal commits the visible beat together with its delivery receipt in `π/.runtime/delivery.json`.
- `π/memory/`: ordinary Markdown memory files created by π as requested.
- `π/logs/model-calls.jsonl`: one record per model call, including provider/model, requested reasoning effort, timings, token usage, cache usage, and reported or estimated cost. Failed calls retain the original SDK message, HTTP error bodies, stream error events and thrown exceptions with their causes when available. HTTP failures from recovered retries are also recorded. Credential values are redacted. A cost estimate is not a billing receipt.
- `π/.runtime/`: browser profile, chat drafts, pending chat references, derived media previews.

Direct edits to valid beat lines in index.md are detected. Move a marker with its passage when reordering. Removing a marker retires its ID. Metadata format 2 reserves IDs independently of document order and records joins as redirects. On first open it migrates legacy markers and retires old paste gaps. Current prose stays in Markdown. A temporary metadata journal completes interrupted saves. Malformed files and conflicting concurrent edits block overwriting and show an error; copy any unsaved app text before reloading. No silent conflict resolution or remote synchronization is implemented.

On first open the editor reads the current `<3/stream.md`, falling back to the older nested `stream.md` on pre-migration workspaces. It writes `<3/stream/index.md` with the same beat IDs and updates managed references. During the transition, the index may link to the active writer’s file.

The November 12–19 import copied each nonempty line into the stream. Its original filename and line number remain in beat metadata. The editor reads the text from `index.md`.

## Models and work

The Electron renderer has no Node access. Stream owns its local document editor. π runs as a separately installed macOS login service with its own code, dependencies, and release selection. Stream sends addressed messages through a versioned disk queue in π/.runtime. The editor can keep saving while π is stopped, and π can finish accepted work after the editor quits. After a service crash, interrupted tasks can be resumed explicitly.

The model layer uses `@earendil-works/pi-ai`, independently of Codex or Claude app-server. OpenAI, Anthropic, Google, and OpenRouter API credentials are read from the launch environment; they are never written into the workspace or sent to the renderer. Ask π directly with `/current model`, `/list models for openai`, or `/use openai/gpt-5.4-mini`. Use `/use Astra medium` (or `/use chatgpt/gpt-6.2-astra medium`) to select model and effort together. `/reasoning high` changes effort alone. `/current model` shows both settings. Supported preferences are default, minimal, low, medium, high, xhigh, and max; actual support depends on the provider and model. Default omits the explicit effort on ChatGPT plan requests. Settings persist per app and apply to newly submitted runs, including follow-ups in an existing thread. Local settings queries need no model call. The initial model is OpenAI `gpt-5.4-mini`.

> π: π reads the shared workspace’s root `AGENTS.md` into the system prompt before each model call, followed by the instructions for that call. Main and Preview use the same file. Reply style belongs in its π section; routing and organization keep their own output formats.

See the [π overview](../../../π/README.md) for routing, attention, and execution records. Model work starts when you submit a bubble. A prose beat beginning with π stays prose. Continuous autonomous interpretation of every prose beat is not enabled in this first build. Tools support reading beats/files, redacting on request, opening a page, creating memory, editing this app's source, running checks, and asking the user a question. `ask_user` yields the run until a reply arrives. Ask `/capabilities` about available tools. π can run shell commands in the active self workspace and shared Stream source. On macOS these commands run with a temporary home, a clean environment, restricted file access, a time limit and capped output. Stream records use their own tools. Shell writes to release selections, Git metadata and private runtime records are restricted. The shell is offline by default. A background network request pauses its thread. Status surfaces the pending review. Asking to review it opens a native Allow once dialog with the exact working directory and command. Tests can use local loopback. Codex connectors and desktop automation are separate integrations.

Write `/connect my ChatGPT` and finish sign-in in the system browser. Stream selects the first model offered by your account. Use `/list models for chatgpt`, `/use chatgpt/<model>`, `/ChatGPT status`, or `/disconnect ChatGPT`. Preview and the writing app have separate connections. Each stores its credentials encrypted by macOS Keychain-backed storage outside self. ChatGPT plan calls keep local transcripts, tool results, timings and available token counts. Their dollar cost is recorded as null. A plan limit or expired connection stops the call. For Claude, supply `ANTHROPIC_API_KEY`, ask for the Anthropic models, and explicitly select one in the same chat.

## Develop

Install Node 24 LTS (minimum 22.19), then run these commands from `<3/artifacts/stream-app/`. Use the committed lockfile:

```sh
npm ci
npx --no-install install-electron
npm run dev
```

The development launcher uses the Preview data root. For the packaged workflow, run:

```sh
npm run check
npm test
npm run build
npm run preview:setup
npm run preview
```

A build stages a fresh snapshot under `build/releases/` and atomically selects it for Preview's next launch. `npm run preview` relaunches only Preview in the background. `preview:setup` seeds `.runtime/preview-self` once from the current Markdown and metadata. Its browser profile, edits, threads, and asset imports stay separate. Preview also copies missing transcripts referenced by its historical chat blocks. Historical media originals stay outside the seed.

Install π separately for the intended workspace as described in the [π service guide](../../../π/service/README.md).

From a Stream bubble, `/build preview` builds and stages the source. Open Preview normally to try it. Ask π in your own words to make Preview the Main version. From packaged Preview, π promotes the exact release you are running, even if a newer candidate has been staged. From Main, π selects the currently staged Preview. Main picks up the selection on its next ordinary launch. The shortcuts `/use this Preview in Main` and `/promote preview` use the same action.

To adopt the staged version from Terminal, run `npm run promote`. Stream switches on the writer's next normal launch. Promotion copies only the release selection; the real stream remains its own data source. On a new Mac, run `npm run package` after the initial build and promotion, then copy both app bundles from `build/` to the Desktop. Keep the checkout and its ignored `build/releases/` directory on disk.

## New laptop

Clone `https://github.com/koopuluri/self.git`, then follow Develop above to install dependencies, stage the first release, and package both launchers. The current stream, beat metadata, and source come with Git. Shared assets, browser logins, local threads/logs, and API credentials do not. Media references remain in the stream and will work after the original files are copied into the same workspace-relative locations.

The packaged app uses its own Electron runtime for π's checks, so it does not depend on the previous laptop's Node path. For MOV previews, install ffmpeg in `/opt/homebrew/bin/ffmpeg` or set `PI_FFMPEG_BINARY`. HEIC conversion uses macOS's built-in `sips`. Launch from an environment containing the provider API key when using API-key models; credentials are never committed.
