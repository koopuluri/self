---
name: video-process
description: Create or iterate a Ghost video, organize its media, and preserve selected creative discussion with immutable native previews. Use save-chat for full conversation archives and save chat requests.
---

# Video process

Read `tools/video-process/README.md` for the installed player, recipe, and CLI. Resolve Ghost from this skill's location (`../../..`). Use the existing process document when continuing a creation; Lovebirds lives in `<3/videos/lovebirds.md`.

## Working agreement

- The process doc is the selected creative history of this video. Preserve the brief, edits, annotations, and redactions. Re-read it before editing. Full conversation archives belong in `<3/chats/` through the save-chat skill; never restore redacted process content from those archives.
- Creative edits happen through prompts. Playback controls are fine; do not add sliders or a separate editing UI.
- Apply the video defaults below unless the user overrides them. Check that framing retains the subjects.
- Display video artifacts in the process doc. Its Obsidian artifact card opens a native macOS preview window. Do not embed video previews in chat. Keep operational replies short and let the document carry the work.
- New editorial notes and one-line iteration summaries are authored by π. Use `> π:` for notes and `> [!note]- π: ...` for the collapsible summary. Preserve historical message bodies and speaker attribution.

## Defaults for all videos

These are the user's promoted defaults, established in the [Lovebirds process](../../../%3C3/videos/lovebirds.md). Keep the authoritative values here; `AGENTS.md` and tool documentation should link here. Explicit directions for a video take precedence.

- **Frame:** 4:3. Scale proportionally and crop to fill; preserve subjects, with no stretching or letterbox/pillarbox bars.
- **Grain:** `lotus-film-v1`, amount `0.65`, cadence `24` fps, reference height `1080`. Keep it running over footage, fades, and title cards. This is the lotus grain formula, without its color-pop grade.
- **Title:** centered Baskerville. Font size is `canvas.height × (95.76 / 2160)` (about 4.4333% of frame height), preserving the approved Lovebirds proportions at other resolutions.
- **Audio ceilings:** integrated loudness at or below **−18 LUFS**, true peak at or below **−1.5 dBTP**. The quieter loudness ceiling is a working choice following the user's request for less loud audio; it is not a platform requirement. Attenuate only: do not boost material already below both ceilings, normalize every track to the ceiling, or apply a fixed dB reduction to every video.

Measure the complete mix with its fades, then choose additional gain in dB as `min(0, -18 - measured_LUFS, -1.5 - measured_dBTP)`. Account for existing gain, preserve dynamics, and remeasure the encoded output. Leave a small margin or attenuate further if encoding puts it above either ceiling. Record measurements and the chosen gain in the process doc. For silent audio, skip loudness normalization.

Resolve these defaults to concrete values in each new recipe. Record the skill path and its current SHA-256 in recipe provenance so the default policy used is identifiable. Retain explicit per-video overrides when iterating. Changing this skill does not alter existing immutable artifacts; applying a new default to an existing video creates a new iteration.

## Organize before creating or continuing

Apply the [organize skill](../organize/SKILL.md) for moves. Before composing or previewing a new video, move its Markdown doc into `<3/videos/` if it is elsewhere. Keep an existing `DOC.artifacts/` folder alongside the doc, preserving every recipe byte and artifact ID. Repair active artifact blocks, incoming navigation links, relative media links, and process registrations. Do not rewrite historical quoted message bodies.

Move all referenced local source clips, music, images, and other video inputs into `<3/assets/` before using them. Review the brief, embeds, recipe inputs, and downloaded originals, not only the clips selected for the final cut. For repository-local media, `process.py move-asset PATH` preserves bytes, handles name collisions, and records redirects needed by older recipes. Repair active Markdown/Obsidian references after moving. Place new downloads directly in `<3/assets/`; when the user adds assets mid-conversation, organize those assets before the next iteration too. External song URLs stay as provenance; do not treat unrelated chat attachments as video inputs. Never delete an external original merely because it is referenced.

Use verified redirects for old recipes whose media moved; never rewrite their source paths or hashes in place. New checkpoints must resolve their media to `<3/assets/`. Organization does not authorize publishing, and the publisher maintains the private archive manifest.

## Record and iterate

Identify the exact current local Codex session from its thread ID; inspect only that session. Follow the source fidelity and model provenance conventions in `../save-chat/SKILL.md` when another source or format needs handling. Do not reconstruct messages from a summary. The installed recorder supports local Codex JSONL records, not arbitrary providers.

Use `process.py register DOC SESSION` to initialize/register the organized doc and install the preview plugin. Registration never imports chat messages; the plugin has no recording timer. Legacy `sync` calls are harmless no-ops.

On every turn while working on a video, review new visible messages with `process.py pending DOC SESSION` and record everything that impacts the video, including discussion-only turns that produce no new artifact. This is an automatic responsibility of the agent within this skill: the user does not need to request capture, select messages, or run recording commands. Do not wait for the next iteration or a “save chat” request.

Exercise judgment: include creative intent, source/music choices, feedback, approvals, rejected alternatives, editing decisions, reasoning, and results that affect or explain the video. Preserve both user and visible assistant contributions. Exclude discussions about organizing Ghost, building the system, skill changes, saving chats, and unrelated operations. For mixed discussions, retain the part that affects this video. Do not use keyword matching as a substitute for that judgment. Workflow-maintenance exchanges such as this recording-policy discussion belong only in the full chat archive, which the user saves separately in `<3/chats/` at the end of the chat.

Write a local selection JSON with `{"through": LAST_REVIEWED_SOURCE_LINE, "messages": [{"line": MESSAGE_LINE}]}` and run `process.py record DOC SESSION --selection FILE`. For a mixed message, use `{"line": MESSAGE_LINE, "excerpt": "exact video-relevant substring"}`; the recorder labels it as an excerpt and preserves its source metadata. Never paraphrase a historical message as its author's words. An empty messages list marks irrelevant discussion reviewed without inserting it. Reviewed omissions and redactions must not be replayed. Capture relevant final replies on the next creative turn when they become available in the source; do not prewrite future replies.

**“Save chat” always invokes [save-chat](../save-chat/SKILL.md)** and creates or updates the original-message transcript in `<3/chats/`, even when this chat also has a video process doc. It does not invoke process recording. The transcript and process doc serve different purposes; saving a full chat does not restore omissions in the process doc.

Before producing an artifact, read the original sources and latest user direction. Copy the previous artifact's recipe into a local draft under `.ghost/video-process/` and edit that draft. Use original media references, never an intermediate export as the next source. Identify provisional choices in π notes; do not label an unreviewed artifact approved.

Validate the composition, record the selected video-relevant discussion, and run `process.py checkpoint DOC DRAFT --summary 'One-line essence of the change' --parent PREVIOUS_RECIPE`. For the first artifact omit `--parent`; for a variation, point to the actual branch origin. The command freezes source fingerprints and renderer code, folds the discussion, and appends the artifact. Do not overwrite an existing artifact, its archived renderer, or referenced source assets. Renderer changes become a new archived engine on the next checkpoint.

Keep the summary faithful to what changed and the user's expressed reason. Do not infer a general taste preference from every implementation choice. The full discussion remains available under it. If a command fails because process markers were removed or the source shrank, preserve the document and resolve that discrepancy; do not reset cursors and replay old messages.

Verify the saved artifact with `process.py verify` and exercise relevant native playback/composition paths after renderer changes. Test scene boundaries, fades, titles, and audio when changing them. Native media services may require command execution outside a restrictive sandbox. Report what was actually verified; recorded OS dependencies do not guarantee pixel-identical output on future macOS versions.

Public previews, remote backups, commits, and publication follow their separate explicit workflows. Local creation does not authorize publishing.
