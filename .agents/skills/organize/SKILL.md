---
name: organize
description: Organize the self personal-stack workspace (formerly Ghost), preserving source records and repairing links. Use for workspace cleanup, reorganization, and publication preparation.
---

# Organize Ghost

Resolve Ghost's root from this skill's location (`../../..`). Read the mission in `README.md`, the structure in `AGENTS.md`, and instructions relevant to the files being moved. Organization changes placement and references, not authorship or wording.

## Find the right homes

Inspect the working tree, including untracked root-level files, and identify misplaced artifacts by their contents and purpose rather than extension alone. Use the personal stack structure in root `AGENTS.md`:

- `<3/`: notes, essays, videos, chats, browsing, taste, inbox, communication, products, and shared assets.
- `π/`: personal model training, evaluation, versions, and serving.
- `$/`: financial records and personal stock.
- `tools/`: shared helpers. Product applications belong under `<3/products/`.
- `.agents/skills/`: reusable workflows.

Loose notes go in `<3/notes/`. Preserve filenames, authorship and original media bytes. Use existing destinations; add deeper structure only when material warrants it. Keep app-owned resources with their app. Runtime state, credentials and generated output stay excluded. The workspace root README and section/directory READMEs are the site's source copy, so changes to them affect the site too.

## Move without losing context

Preserve filenames where practical, file contents, user edits, annotations, and original media bytes. Never overwrite a destination or discard a file because its name matches another. Compare colliding files and choose a distinct destination when needed; do not introduce duplicate copies of an asset already stored in `<3/assets/`.

Before moving files, locate their references and determine how those paths resolve. Repair incoming references and relative links inside moved documents, including Markdown links and images, Obsidian links and embeds, indexes, and active code or configuration paths. Preserve anchors, labels, and embed options. Change only the path portions needed for the move; do not rewrite historical transcript or quotation text. If a historical path must remain literal, preserve it and put any navigation aid outside the source record in a `> π:` callout.

Keep original titles and wording intact. Do not process notebook images, rewrite notes, summarize transcripts, or add editorial prose as a side effect. Any necessary new editorial annotation uses `> π:`.

Check publication dependencies when moving files consumed by the site: update affected imports or content references and `ghost.publish.json`'s `site.inputs` before a release plan is prepared. Preserve Git exclusions for large media and credentials. Public media serving is conditional on the separately configured capped gateway; do not change R2 settings during organization. Let the publisher maintain `<3/assets/manifest.json`; do not delete historical archive entries or alter remote objects during organization.

## Verify and finish

Review the diff and move list for accidental content changes or lost files. Verify affected links and embeds resolve from their new locations, and run relevant content or build checks if application inputs changed. A repeated run should leave already organized material in place.

Report the moves and any unresolved placements or references concisely. Organizing alone does not commit, upload, push, or deploy. When called by the publish skill, finish organization before returning to release preparation so the proposed message and approved plan cover the final layout.
