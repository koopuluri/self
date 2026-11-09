import { essaySources, readDocument } from "./workspace.mjs";

// Compatibility for social previews; every essay now comes from the workspace.
export function getSelectedEssay(slug: string) {
  const source = essaySources().find(item => item === `<3/essays/${slug}.md`);
  return source ? { slug, source } : undefined;
}
export async function readSelectedEssay(slug: string) {
  const essay = getSelectedEssay(slug);
  if (!essay) return null;
  const document = readDocument(essay.source);
  return document ? { ...document, ...essay } : null;
}
