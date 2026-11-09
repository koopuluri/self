# Video process

Create a video by prompting the agent, keep selected creative discussion in its Markdown process document, and open any artifact in a native macOS player. The first working document is [Lovebirds](../../%3C3/videos/lovebirds.md).

## Use

Enable **Ghost Video Process** in Obsidian → Settings → Community plugins. `ghost-video` blocks become artifact cards in Reading view and Live Preview. **Open native preview** opens an AppKit window using AVPlayer, AVFoundation, Core Image, and Metal. Only playback controls are exposed; creative changes happen through prompts.

An iframe cannot contain an AppKit view. This version deliberately uses a separate native preview window, as chosen in the process discussion. It plays compositions directly from their sources; no intermediate movie export, server, browser compositor, or site publishing is involved.

The agent automatically handles selective capture on every turn while working on a video, including discussion that produces no new artifact. Everything that affects the video goes into its process document; unrelated discussion stays out. The user does not need to request capture or select messages. This judgment is part of the existing video-process skill, rather than an indiscriminate background copier. “Save chat” uses the separate save-chat skill and writes the full original conversation to `<3/chats/`.

## Organize first

Video docs live in `<3/videos/`, with their `DOC.artifacts/` folders beside them. All referenced video inputs belong in `<3/assets/`, including new inputs added during iteration and downloaded music originals. Move media with `process.py move-asset PATH`, then repair active document links. The command avoids overwriting different files and records verified old-path redirects in `asset-relocations.json`. It leaves the publisher's archive manifest alone.

Old recipe bytes and IDs stay unchanged. Verification resolves old source paths through the redirects and checks their saved hashes. Preview, probe, and export pass the archived native renderer a disposable recipe with resolved paths. Future checkpoints store the actual `<3/assets/` paths. Historical transcript links remain literal; active navigation links are updated when docs move.

## Make an iteration

Run from Ghost's root. Python 3.9+, Xcode command-line tools, and macOS with Metal are required. Renderer builds are cached locally. The current engine was tested on an M2 Pro running macOS 27.

```sh
python3 tools/video-process/process.py register <3/videos/lovebirds.md /absolute/path/to/the/current-session.jsonl
python3 tools/video-process/process.py pending <3/videos/lovebirds.md /absolute/path/to/the/current-session.jsonl
python3 tools/video-process/process.py record <3/videos/lovebirds.md /absolute/path/to/the/current-session.jsonl --selection .ghost/video-process/selection.json
python3 tools/video-process/process.py checkpoint <3/videos/lovebirds.md .ghost/video-process/draft.json --summary 'Short description of this change.' --parent <3/videos/lovebirds.artifacts/PREVIOUS_ID.json
```

`register` installs the preview plugin and associates an organized doc with an exact session, without recording messages. Enable the plugin in Obsidian once. After plugin updates, reload it to use the new UI. Already-loaded older versions cannot blanket-capture: their legacy `sync` command is a no-op.

`pending` returns unreviewed visible messages and the source line through which they were read. The agent chooses relevance; no keyword classifier makes that decision. A selection file looks like `{"through": 120, "messages": [{"line": 42}, {"line": 105, "excerpt": "Make the title larger."}]}`. Only selected messages are appended in source order. Excerpts must match the source exactly and are labelled. `messages: []` advances the reviewed boundary without adding text. Old reviewed lines cannot be replayed, including previously skipped or redacted messages. The final response can be considered on the next creative turn once it exists in the source.

For a first artifact omit `--parent`. For a branch supply the artifact being branched from, even if it is not the most recent one. Copy an existing recipe to a local draft, edit the draft, then checkpoint it. Checkpoint computes new identities/fingerprints; never edit a checkpoint in place.

The checkpoint folds the conversation since the previous artifact under a one-line π callout, inserts a native artifact card, and leaves an open conversation below it. Obsidian's collapsible callout syntax is used instead of HTML wrapping that can interfere with Markdown rendering.

## What is preserved

- The process document is the editable creative history. Its reviewed source-line cursors prevent omitted or redacted messages from being restored. Recording re-reads current contents and refuses to proceed if metadata is missing or source history shrank.
- Each `DOC.artifacts/ID.json` freezes the recipe, parent artifact, source SHA-256 fingerprints, renderer identity, and OS/architecture. The original assets are referenced once, never copied per iteration. Missing/changed sources fail visibly.
- `engines/HASH.swift` freezes the exact rendering code once per engine revision. Old artifacts compile and run their archived renderer. `.ghost/video-process/` contains disposable binaries, draft recipes, locks, and test frames.
- System frameworks and named system fonts are OS dependencies. The OS is recorded; this is not a promise of bit-identical output across future macOS/font changes. Assets remain local until included in Ghost's separate archive workflow.
- The source chat still exists in its original provider/session storage. Redacting the process document does not delete that original. An explicit save-chat request archives that original conversation separately in `<3/chats/`; it does not replay omissions into the process doc.

## Current recipe

See the Lovebirds artifacts for complete examples. `schema` is `ghost.video.v1`. `canvas` specifies even pixel dimensions, integer fps, and `hlg2020`. New videos default to 4:3, as recorded in Ghost's `AGENTS.md`. `clips` contains ordered source paths, source start frames, and durations in composition frames. `canvas.fit` defaults to `cover`: each oriented clip scales proportionally and is cropped at the center to fill the canvas. Check that the subjects remain in frame. `contain` is available when explicitly requested. Original clip audio is muted.

`fadeInFrames` and `fadeOutFrames` apply to the whole footage sequence. Optional `fadeInCurve` accepts `linear` (default) or `smoothstep` for an eased opening. Optional `titleCard` specifies text, frame duration, fade durations, font name and size. Optional `audio` specifies a source, in-point/duration in seconds, fade durations, and `gainDB` (finite, nonpositive; default 0). Gain scales both the steady volume and fade ramps in previews and exports.

The authoritative creative defaults and audio ceilings live in [the video-process skill](../../.agents/skills/video-process/SKILL.md). Measure integrated loudness and true peak on the encoded export, rather than assuming fades control overall loudness. Apply its attenuation-only policy, preserving quieter material and dynamics; record the measurements and chosen gain. Remeasure after AAC encoding.

Optional `grain` uses model `lotus-film-v1`, ported from `lotus-study/look.js`: amount `0.91`, cadence `24` fps, and reference height `1080` reproduce the selected lotus grain settings. The same fine/coarse noise, exposure response, and chroma variation run after compositing, including during fades and the title card. The time seed comes from composition time so seeking is repeatable. The native port applies grain in a display-encoded domain and returns to linear HDR without the original SDR highlight clamp. It does not include the lotus color-pop grade. New renderer revisions are archived with their artifacts; earlier artifacts keep their original engine and framing.

The compositor accepts and emits 10-bit YUV, uses a half-float linear BT.2020 working space, and tags output as HLG. It preserves an HDR pipeline, but does not preserve Dolby Vision dynamic metadata. SDR or mixed-transfer projects need an explicit color policy before extending this schema.

## Verify

```sh
python3 -m unittest discover -s tools/video-process -p 'test_*.py'
python3 tools/video-process/process.py verify <3/videos/lovebirds.artifacts/ID.json
python3 tools/video-process/process.py probe <3/videos/lovebirds.artifacts/ID.json .ghost/video-process/probe
```

`probe` exercises the same native compositor as playback at the start, both clips, footage fade, title, and final fade. It writes sample PNGs for inspection and a JSON report with measured 10-bit luma values. PNGs are SDR inspection images, not the native preview. Native decoding needs access to macOS media services and may not work inside a restrictive command sandbox.

## Export a chosen cut

```sh
python3 tools/video-process/export.py <3/videos/lovebirds.artifacts/ID.json .ghost/video-process/exports/lovebirds.mp4
```

The exporter verifies the checkpoint and compiles its archived compositor with `Export.swift` as the entry point. AVFoundation exports the composition and soundtrack to HEVC MP4 at the recipe's dimensions. Existing output files are refused. Verify the exported file's dimensions, duration, color metadata, and audio before copying it to the user's requested destination. Exporting does not create a new creative iteration or modify the chosen artifact. Native media services may require execution outside a restrictive sandbox.

Publication and lower-resolution public previews are intentionally deferred.
