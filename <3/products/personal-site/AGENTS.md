# Personal site

Read the root AGENTS.md, instructions.md and DESIGN_GUIDELINES.md. Read relevant Next.js guides in node_modules/next/dist/docs before changing routes or rendering.

The site is a public reflection of self. Use `lib/workspace.mjs` as the path/catalog contract. Root and directory READMEs are canonical page copy. Every workspace essay has a root slug, including drafts; historical essay selection is retained only as evidence in content/historical-essay-selection.json. No separate publication allowlist or generated copy of source prose.

The three top-level sections share the root README introduction and icon navigation. `/` opens personhood; `/<3` also resolves to it. `/π` and `/$` read their section READMEs. Nested documents use InternalPage. Preserve typography, spacing, SVG icon geometry, section animation, essay headings and historical routes. Quote dates and render them verbatim.

Only intentional workspace roots are cataloged. Do not traverse symlinks, credentials, runtime state, dependencies, caches or generated builds. Markdown renders without executing MDX. Links and Obsidian embeds resolve from their source location. Local media is served only in development. Production media requires the separately configured capped gateway; never expose the archive directly as a fallback.

Run npm run check:content, npm run test:workspace, and npm run build; preview desktop/mobile, keyboard navigation, source text, links and media. Keep publication separate and use the root publish skill with exact-message approval.

## when explicitly asked to update the historical X archive

This is no longer the homepage update workflow. Read `content/expressions.json`
and `content/maipai.json` before working on that archive.

1. Establish available browser control. Prefer a new Safari tab if supported;
   otherwise explain the available alternative. Inspect https://x.com/koopuluri
   through browser/computer interaction. Never claim inaccessible posts were read.
2. Compare with content/expressions.json. Include ONLY expandable long text posts
   (verify Show more/expansion) or original videos with verified text above them.
   Exclude short text, ordinary images, videos without text, bare reposts,
   incidental acknowledgments and ordinary replies. A quote-post wrapper does
   not qualify just because the quoted post has a video; inspect and link the
   qualifying original once. GIFs do not count as original videos. Native X Articles
   are currently deferred pending an explicit scope decision; do not silently add
   them or mistake an Article preview for expandable own text. A connected thread may be one entry linked to its
   opening only if it qualifies as an expandable long expression.
3. Inspect original post dates and text. Prefer the author's title/opening words.
   Generated titles must be short, faithful, descriptive and tentative where
   the post is tentative. Do not infer video content from an inaccessible video.
4. Add/update by stable post ID without duplicates, including thread IDs. Keep
   publication dates, URLs, selection type and source evidence. Record exclusions,
   last successful check and coverage gaps. A partial check is not a full archive;
   never silently truncate, remove older entries, or advance coverage past a gap.
5. Refresh content/maipai.json only when warranted. Maipai introduces itself as
   karthik's ai, helping keep track of him. Briefly describe actual recent activity
   provisionally, with warm playful informality and optional light exasperation.
   Preserve uncertainty and contradiction. No invented overarching thesis,
   permanent traits, marketing, chat invitation or em dashes. Keep it under 90 words.
   Do not restate titles or inventory the links; avoid filler about archive size.
6. ALL new/edited visitor-facing language must be lowercase, extremely informal,
   relaxed, playful and deliberately unpolished. Do not turn every line into a joke.
   This includes titles, metadata, dates and accessibility labels. Source excerpts
   and internal evidence may preserve original casing. Do not use CSS lowercase
   as a substitute for correctly authored copy.
7. Run npm run check:content and npm run build. Verify the actual homepage on
   desktop and mobile: lowercase copy, no overflow, clear focus/links, newest-first
   ordering, no visible dates, correct original URLs and evidence for every selection. Build must list
   / as static. Browser verification does not replace source selection review.
8. Publish through self's `publish-ghost` skill. Propose the short lowercase
   commit message and wait for the user's confirmation before committing,
   uploading, pushing or deploying. The publisher targets the existing
   `karthikuppu.com` Vercel project in `homan-projects` only when site inputs change.
   Automatic Git deployments are disabled in `vercel.json`; do not push the
   preserved import repository as a second publication path. Verify
   https://koopuluri.com and the resulting www page after a deployment.
   Preserve unrelated project, environment and domain settings. Never commit
   credentials or .vercel state. Report deployed URL and any coverage/verification gaps.

The existing essay/video routes and their source are historical work, retained
without homepage navigation. Do not delete or rewrite them as part of an archive
update. Keep unrelated desktop and Expression iOS projects untouched.

Essay URLs live at `/<slug>` (for example `/personal-stack`), and source filenames
match their slugs. Preserve author-supplied essay title capitalization, including
“The Personal Stack”. The original manifesto URLs redirect to `/personal-stack`.

Essay titles and optional dates come from YAML frontmatter in the source Markdown,
not the selection JSON. Preserve their capitalization; quote dates and display
them verbatim above the essay title (14px Inter, muted color). Keep homepage links
title-only. Ordered list markers use `1)`, `2)`, etc. See README.md for the schema.

Internal pages (essays and video pages) use the shared `InternalPage` layout.
Its only navigation item is a fixed circular profile photo linking home (48px
on desktop, 36px at widths up to 768px),
24px from the desktop top/left edges. On mobile, align its left edge with the
content column, including centered tablet columns. Show the white fade only
when the photo horizontally overlaps the actual content column; measure that
overlap on resize and route changes, rather than using a desktop/mobile cutoff.
When the photo sits outside the content, the navbar background is transparent.
Reserve space above the content; keep this navigation off `/`, `/π` and `/$`.
