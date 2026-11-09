# Self agent instructions

self is the personal stack: personhood (`<3/`), personal artificial intelligence (`π/`), and personal stock (`$/`). Keep its record useful for π now and later, and documentation concise.

- `<3/`: notes, essays, videos, chats, browsing, taste, inbox, communication, products, and assets. Create deeper structure as actual material warrants it.
- `π/`: versioned personal models, training, evaluation, and serving. Source records keep their homes elsewhere in self.
- `$/`: financial records and personal stock.
- `tools/`: supporting helpers shared across the stack.
- `.agents/skills/`: reusable workflows.

`inbox/` is the data powering the inbox app; `communication/` holds correspondence. Inbox items can reference records elsewhere. `browsing/` records activity; `taste/` holds deliberate collections and annotations. Products live in `<3/products/`; shared media in `<3/assets/`.

Preserve source wording, authorship, annotations, and meaningful versions. Historical chats and immutable video recipes/engines are source records, never mass-rewritten to update names or paths. Use relocation support for frozen artifacts. Organization and recording do not publish anything.

Keep self as the Obsidian vault root. `.obsidianignore` excludes dependencies and generated files. For interface work, apply [design guidelines](%3C3/products/personal-site/DESIGN_GUIDELINES.md) and the product's established visual rhythm.

## π — personal artificial intelligence

The user's personal agent is **π** (pi). Across this project, all skills and future chats should label assistant-authored editorial notes, annotations, suggestions, critiques, and proposed additions to the user's material with π.

Use a Markdown blockquote starting with `> π:` so the agent's words are visually distinct from the user's:

> π: Missing beat: how does this connect to the next paragraph?

Keep multiline notes inside the blockquote. Do not blend assistant commentary into user-authored prose or attribute the user's own notes to π. Preserve historical transcripts and quotations as written; this convention applies to new editorial annotations, not rewriting source records. Ordinary conversational replies and operational status updates do not need this prefix.

## Notebook processing

When the user says "process notes" (or similar) about a document containing notebook images, read and apply `.agents/skills/process-notes/SKILL.md`. Produce a transcript below each image and a complete combined narrative above a divider. Reordering is permitted; omissions, rewrites, and unmarked additions are not. Put proposed wording and missing-beat suggestions in π callouts.

## Publishing self

Use `.agents/skills/publish-ghost/SKILL.md` when asked to publish self (or the former name, Ghost). Prepare all changes, propose a short lowercase commit message, and wait for approval of that exact message before committing, uploading, pushing, or deploying. Changes to source or scope require a fresh plan.

Material deliberately brought into self is public by default, after publication review. Private thinking remains outside this workspace. Credentials, sessions, local app state, dependencies and builds are excluded. Review the outgoing source, history, media, metadata and related references; a clean automated scan is not a privacy guarantee.

The site reads root and directory READMEs and renders workspace documents at their paths. Essays in `<3/essays/` keep root slugs. The site lives in `<3/products/personal-site/`. The root README supplies the shared introduction; `<3/README.md`, `π/README.md`, and `$/README.md` supply section pages. Preserve author wording. New explanatory prose in the user's material uses π callouts.

Public media serving is approved in principle, conditional on bounded traffic costs. Normal publication uploads assets to the existing private R2 bucket, pushes source to `koopuluri/self`, and deploys the site. Cloudflare domain changes and the public media gateway remain deferred. Until the capped gateway is configured and verified, shared media stays locally previewable and the existing private bucket stays private. Do not silently enable public bucket access. Alerts and local limits do not constitute a provider-wide $20 hard cap.

Future X DMs will have clear public-channel notice. Existing conversations require participants' consent before publication. Private communication belongs outside this system (for example iMessage/WhatsApp). Transparency is an adaptable policy.

## Video workflows and defaults

For every video, apply the organization, selective recording, and defaults in [.agents/skills/video-process/SKILL.md](.agents/skills/video-process/SKILL.md). That skill is the authoritative home for framing, grain, typography, and audio ceilings. Explicit user overrides take precedence; existing immutable artifacts retain their saved settings.

“Save chat” means apply `.agents/skills/save-chat/SKILL.md` and save a full transcript in `<3/chats/`. Video process docs in `<3/videos/` retain only video-relevant discussion; they are not the destination for full chat saves or workflow-maintenance discussions.
