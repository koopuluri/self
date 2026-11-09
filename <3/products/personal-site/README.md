# koopuluri.com

The public reflection of [self](../../../README.md), built from its original files.

## content and routes

- Root `README.md` is the shared introduction above the section navigation.
- `<3/README.md`, `π/README.md`, and `$/README.md` supply the three sections. `/` opens personhood; `/<3` is also available.
- Directory READMEs supply their landing pages. Each page also lists children not already linked by its README.
- `<3/essays/NAME.md` renders at `/NAME`. Other Markdown uses its repository path without `.md`; source files keep their extension.
- Markdown links and Obsidian links/embeds resolve relative to the original document. Author text and historical transcripts stay intact.
- `lib/workspace.mjs` defines the public catalog. Hidden runtime state, credentials, dependencies, builds and symlinks are excluded. `.agents/skills` is intentional public documentation.
- The former selection is preserved in `content/historical-essay-selection.json`; it no longer controls availability.
- Historical MDX essays, video routes, X archive evidence and redirects remain available.

## local development

Run from this directory:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3100
npm run check:content
npm run test:workspace
npm run build
```

The development-only `/api/files/` route streams local media and supports video ranges. It never serves credentials or arbitrary filesystem paths. Production media uses `NEXT_PUBLIC_SELF_MEDIA_ORIGIN` and must be hosted through the separately verified, capped media Worker. Until then, production media access fails closed; local preview still works.

## design

Read [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md) and [instructions.md](instructions.md). Reuse the existing 14px Inter body, 16/32px spacing rhythm, portrait, icon navigation, blue links, and Georgia essay titles. Technical docs remain distinct from author prose; editorial additions use π callouts.

## publication

Use the root [publish workflow](../../../.agents/skills/publish-ghost/SKILL.md). GitHub rename, R2 gateway setup and deployment are deferred until explicitly resumed. Publication fingerprints cover workspace content, including all READMEs and media manifest changes. Preserve the existing Vercel project and domains.
