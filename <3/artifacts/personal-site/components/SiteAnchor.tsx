import type { AnchorHTMLAttributes } from "react";
import { site } from "@/lib/site";

const siteHost = new URL(site.url).host.replace(/^www\./, "");

function isExternalWebLink(href: string) {
  try {
    const url = new URL(href, site.url);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      url.host.replace(/^www\./, "") !== siteHost;
  } catch {
    return false;
  }
}

export function SiteAnchor({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = href ? isExternalWebLink(href) : false;
  return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} {...props} />;
}
