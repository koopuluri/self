import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageEntries, essaySources, readDocument, encodePath } from "@/lib/workspace.mjs";
import { WorkspacePage } from "@/components/WorkspacePage";
import { EssayHeading } from "@/components/EssayHeading";
import { getPostSlugs, getPostMeta, formatDate } from "@/lib/posts";
import { socialMetadata } from "@/lib/social-metadata";

type Params = { workspace: string[] };
export const dynamic = "error";
export const dynamicParams = false;
const reserved = new Set(["<3", "π", "$", "api", "social", "videos"]);
function routeKey(segments: string[]) {
  const raw = encodePath(segments.join("/"));
  if (entries().has(raw)) return raw;
  return encodePath(segments.map(segment => { try { return decodeURIComponent(segment); } catch { return segment; } }).join("/"));
}
function entries() {
  const result = pageEntries();
  for (const source of essaySources()) {
    const slug = source.split("/").at(-1)!.replace(/\.md$/, "");
    if (reserved.has(slug) || result.has(encodePath(slug)) || getPostSlugs().includes(slug)) throw new Error(`Essay slug collides with route: ${slug}`);
    result.set(encodePath(slug), { source, directory: false });
  }
  return result;
}
export function generateStaticParams(): Params[] {
  return [...entries().keys()].filter(url => !reserved.has(decodeURIComponent(url.slice(1))))
    .map(url => ({ workspace: url.slice(1).split("/").map(decodeURIComponent) }))
    .concat(getPostSlugs().map(slug => ({ workspace: [slug] })));
}
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { workspace } = await params;
  const url = routeKey(workspace);
  const item = entries().get(url);
  const doc = item ? readDocument(item.source) : null;
  const historical = workspace.length === 1 ? getPostMeta(workspace[0]) : null;
  const title = doc?.title ?? historical?.title ?? workspace.at(-1)!;
  const essay = item?.source.startsWith("<3/essays/") || !!historical;
  return { title: { absolute: title }, alternates: { canonical: url },
    ...socialMetadata({ title, path: url, image: essay ? `essay-${workspace[0]}` : "home", type: essay ? "article" : "website" }) };
}
export default async function Page({ params }: { params: Promise<Params> }) {
  const { workspace } = await params;
  const item = entries().get(routeKey(workspace));
  if (item) return <WorkspacePage source={item.source} directory={item.directory} />;
  const slug = workspace[0];
  const meta = workspace.length === 1 && getPostSlugs().includes(slug) ? getPostMeta(slug) : null;
  if (!meta) notFound();
  const { default: Content } = await import(`@/posts/${slug}.mdx`);
  return <main className="page essay-page"><EssayHeading title={meta.title} date={meta.date ? formatDate(meta.date) : undefined} /><article className="essay-body reveal"><Content /></article></main>;
}
