# Design guidelines

Apply these principles when creating or changing interfaces in Ghost. Keep exact
product measurements in that product's shared styles and preferences.

- **Group by relationship.** Related elements should read as one unit. Use a
  smaller, consistent gap within a group and a larger gap between independent
  groups. Start with twice the internal gap between groups at the same level.
- **Use one rhythm across the product.** Inspect an established, approved page
  before introducing spacing. Reuse its spacing scale for equivalent relationships
  on every page; do not design each component in isolation.
- **Encode the relationships.** Define shared spacing tokens for related content,
  section separation and tighter details. Prefer a parent-owned gap to accumulated
  child margins and padding. Dividers must not accidentally double the spacing.
- **Compare like with like.** Repeated relationships should have equal spacing.
  Distinguish lines in one unit from separate paragraphs or groups: compact list
  rows can share the text line rhythm rather than inheriting paragraph gaps.
  Account for text line boxes and media edges when assessing perceived gaps; any
  optical adjustment should follow a shared rule rather than a one-off guess.
- **Verify the whole composition.** Check grouping, alignment and rhythm across
  pages, responsive sizes and interaction states. Compare against the established
  reference, not just whether the latest component works. Preserve good existing
  layouts and carry their rules into new work.
