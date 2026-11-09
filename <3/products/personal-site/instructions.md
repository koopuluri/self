# karthik's site preferences

These are persistent user decisions. Keep this file and AGENTS.md current when
Karthik changes a preference; do not ask him to repeat recorded decisions.
Apply [Ghost design guidelines](DESIGN_GUIDELINES.md). The approved essay
page is the spacing reference for the whole site.

## structure

Three top-level pages share a centered profile header, then a divider, an icon-only
segmented navigation row, another divider, and the selected section content:
- heart: personhood, the default homepage at `/`; section title: `expressions` (browser title remains `karthik uppuluri`).
- π: `/π`; visible heading: `personal artificial intelligence`; browser title: `π`.
  Redirect the old `/ai` URL.
- $: `/$`; visible heading: `personal stock`; browser title: `$`.
  Redirect the old `/stock` URL.

The `/π` route uses the percent-encoded folder `app/(main)/%CF%80/` so Next.js
matches browser-encoded requests. Keep the visible URL and canonical path `/π`.

No visible category labels in the navigation. Reuse the coordinated
SVG geometry from self's `<3/assets/manifesto-stack-icons.svg`, including symmetrical π.
Indicate the current page and give links accessible names and keyboard focus.
The deeper essay view has a simple way back home; further nested navigation is
still to be designed.

## homepage

On all three top-level pages, center the 48px circular profile photo above
`karthik uppuluri (x)`, with only the x linked to the profile on X in a new tab. No visible bio.
Use the root README for the displayed name, image and X URL; content/profile.json retains historical metadata.
The heart README starts with `expressions` and the existing essay links, followed by directory navigation. No cards.

The site follows the current self directory. Root README supplies the shared intro; directory READMEs supply landing copy. Personhood opens by default at `/` and is also available at `/<3`. All workspace essays have root slugs. Other documents use their workspace paths, without the `.md` suffix. Each directory displays its README and an automatic list of children not already linked there. New source files do not require a publication allowlist.

Media is public in policy, with local-only preview until a capped Cloudflare Worker is configured. Keep the R2 bucket itself private. Source review and exact-message release approval remain required.

## writing and appearance

Site-authored labels and metadata are lowercase, informal and relaxed. Preserve
essay source text exactly, including its capitalization, formatting and π notes.
No CSS lowercase transformation. New editorial annotations to the user's material
must be Markdown blockquotes starting with `> π:`.

Match [benji.org](https://benji.org/)'s restrained typography, colors and layout.
Measured from its CSS and computed desktop/mobile styles on November 3, 2026:

- Inter variable, 14px type, 20px line height, -0.00563rem (-0.09008px) tracking.
- Body weight 460; page titles 500; article section headings 560; strong text 600.
- Body text, section headings, links and dates stay at 14px. Essay titles are the
  exception: centered 32px Georgia with 40px line-height on desktop, 28px with
  36px line-height at widths up to 768px. Preserve
  source italics.
- Text #111, background #fdfdfc, secondary text black at 40% opacity.
- Full-width dividers: 1px solid #f2f2f2, matching Benji's writing list dividers.
- Outer column 36.375rem (582px), including 16px side padding: 550px content.
- At widths up to 768px, use 24px side padding. Outer top padding is 80px on
  desktop and 32px on mobile; bottom padding is 40px. The shared profile occupies
  the start of this column. After it, two dividers frame the navigation row;
  leave 32px below the second divider before section content.
- Use the shared essay rhythm: `--space-related` (16px) within groups and
  `--space-section` (32px) between groups. The photo-to-name gap, section-heading
  to-content gap and essay paragraph gap all use the same related-content token.
  Use equal section gaps from the profile to the first divider and from the second
  divider to the content. Navigation insets use `--space-detail` (8px) symmetrically.
  The homepage essay list uses consecutive lines at the shared 20px line-height,
  with no extra gap or row padding, matching lines within an essay paragraph.
  Keep the 16px gap between the section heading and the list.

Keep the locally retained Inter variable originally supplied by next/font/google: the Latin WOFF2 was verified
byte-for-byte identical to Benji's font. Do not override it with system sans-serif.
Shared measurements live in app/globals.css and apply on every viewport.

Links deliberately follow the supplied ChatGPT screenshot instead: #35579f blue
at rest and after visiting, no icon or underline at rest, #24447f and a 1px
underline on hover or keyboard focus. Keep the focus outline obvious. The core
icon navigation uses three equal-width segments with 18px SVG icons. A subtle
rounded rectangular background fills the active third and slides between segments
in 240ms. All icons use the same 2.2 stroke width. Active and inactive icons
differ only in color: dark when active, black at 20% opacity when inactive.
Keep the sliding background quiet, at 2% black. No underline or extra active marker.
Respect reduced motion. Keep the shared header mounted between sections so the
slide also works with keyboard navigation and browser history. The profile and
navigation scroll with the page.

No chatbot, personalization, live X integration, runtime AI, database or schedule.

## social previews

Use the same 1200 × 630 warm-white canvas for Open Graph and X large-image cards.
The homepage preview contains only a centered circular portrait (192px).
Every other preview has a small circular portrait at the top left (96px, inset
48px). The `/π` and `/$` previews center the actual navigation SVG icons (160px),
never font-rendered characters. Essay previews center the exact frontmatter title
in 84px Inter 500 with the site's proportional tracking and line-height, without
a date or extra copy. Allow titles to wrap within the centered 960px text column;
center the whole multiline block vertically. Their on-page Georgia headings stay
as specified above.

Generate images statically from the current profile, shared icon component and
current essay titles; retain previews for historical posts. Use local
Inter from `fonts/` so previews render without runtime font requests.

## publishing

Use Ghost's publish workflow. Prepare and show the exact short, lowercase commit
message; wait for approval before committing, uploading, pushing or deploying.
When selecting an essay, also add its exact source path to `ghost.publish.json`
site.inputs so changes to that essay trigger a future site deployment.

Essay URLs live at `/<slug>` (for example `/personal-stack`), and source filenames
match their slugs. Preserve author-supplied essay title capitalization, including
“The Personal Stack”. The original manifesto URLs redirect to `/personal-stack`.

Essay titles and optional dates come from YAML frontmatter in the source Markdown,
not the selection JSON. Preserve their capitalization; quote dates and display
them verbatim above the essay title (14px Inter, muted color). Keep homepage links
title-only. Ordered list markers use `1)`, `2)`, etc. See README.md for the schema.

Place videos in the Markdown body using `[label](/media/file.mp4 "video")`, not
frontmatter. This explicit link title renders an inline native player at that
position. The Personal Stack video follows the three-item list and precedes the
first divider. Preserve originals in <3/assets/ and serve optimized public copies
from <3/products/personal-site/public/media/.

Essay headers are centered within the content column: date first, then title,
with the shared 8px detail gap. The date remains 14px Inter with 20px line-height
and black at 32% opacity. The title is Georgia (weight 400), strong ink: 32px
with 40px line-height on desktop, 28px with 36px line-height on mobile. The
header-to-body gap is 3rem (48px), giving the title group more breathing
room. Body dividers keep their 32px spacing and paragraph gaps remain 16px. Browser tabs show only
the essay title, without the site name suffix. Every
divider has 32px to the adjacent text line boxes, including the final “Onward.”
Media edges get optical compensation of half the line-height minus cap-height
to match text's internal line spacing (about 5px with this font).
Do not stack paragraph padding on top of divider spacing.

Internal pages (essays and video pages) use the shared `InternalPage` layout.
Its only navigation item is a fixed circular profile photo linking home (48px
on desktop, 36px at widths up to 768px),
24px from the desktop top/left edges. On mobile, align its left edge with the
content column, including centered tablet columns. Show the white fade only
when the photo horizontally overlaps the actual content column; measure that
overlap on resize and route changes, rather than using a desktop/mobile cutoff.
When the photo sits outside the content, the navbar background is transparent.
The overlapping treatment should feel like fading mist, never a rectangular bar:
use a continuous 144px feathered mask with gentle backdrop blur, no solid plateau
or hard bottom edge. Keep the photo sharp above that layer. Show the mist only
after scrolling so the initial essay title stays clear.
Reserve space above the content; keep this navigation off `/`, `/π` and `/$`.
