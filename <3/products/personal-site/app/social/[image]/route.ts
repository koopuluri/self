import { essaySources } from "@/lib/workspace.mjs";
import { getPostMeta, getPostSlugs } from "@/lib/posts";
import { readSelectedEssay } from "@/lib/selected-essays";
import { createSocialImage } from "@/lib/social-image";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = new Set([...essaySources().map(source => source.split("/").at(-1)!.replace(/\.md$/, "")), ...getPostSlugs()]);
  return ["home", "ai", "stock", ...[...slugs].map((slug) => `essay-${slug}`)]
    .map((image) => ({ image: `${image}.png` }));
}

export async function GET(_request: Request, { params }: {
  params: Promise<{ image: string }>;
}) {
  const { image } = await params;
  if (image === "home.png") return createSocialImage({ kind: "home" });
  if (image === "ai.png" || image === "stock.png") {
    return createSocialImage({ kind: "section", section: image === "ai.png" ? "ai" : "stock" });
  }
  if (image.startsWith("essay-") && image.endsWith(".png")) {
    const slug = image.slice("essay-".length, -".png".length);
    const essay = await readSelectedEssay(slug);
    // Historical posts are also explicitly enumerated; never read a URL-derived path.
    const post = !essay && getPostSlugs().includes(slug) ? getPostMeta(slug) : null;
    const title = essay?.title ?? post?.title;
    if (title) return createSocialImage({ kind: "essay", title });
  }
  return new Response("not found", { status: 404 });
}
