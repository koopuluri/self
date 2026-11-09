import type { Metadata } from "next";
import { site } from "@/lib/site";

export const socialImageSize = { width: 1200, height: 630 } as const;

export function socialMetadata({
  title,
  path,
  image,
  description = site.description,
  type = "website",
  publishedTime,
}: {
  title: string;
  path: string;
  image: string;
  description?: string;
  type?: "website" | "article";
  publishedTime?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const images = [{
    url: `/social/${image}.png`,
    ...socialImageSize,
    alt: title === site.name ? title : `${title} · ${site.name}`,
  }];

  return {
    openGraph: {
      siteName: site.name,
      title,
      description,
      url: path,
      images,
      ...(type === "article"
        ? { type: "article", authors: [site.name], publishedTime }
        : { type: "website" }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
      creator: site.twitter,
    },
  };
}
