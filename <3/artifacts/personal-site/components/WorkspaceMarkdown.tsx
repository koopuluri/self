import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { inventory, mediaURL, prepareMarkdown, resolveLink } from "@/lib/workspace.mjs";
import { SiteAnchor } from "./SiteAnchor";
import styles from "./GhostEssay.module.css";

export function WorkspaceMarkdown({ source, markdown, className }: { source: string; markdown: string; className?: string }) {
  return <div className={className ?? styles.body}><Markdown remarkPlugins={[remarkGfm]} components={{
    a({ href, title, children }) {
      const url = resolveLink(source, href ?? "");
      if (title === "video") return <video className={styles.video} src={url} controls playsInline preload="metadata" aria-label={typeof children === "string" ? children : "video"} />;
      if (title === "audio") return <audio src={url} controls preload="metadata" aria-label={typeof children === "string" ? children : "audio"} />;
      return <SiteAnchor href={url} title={title}>{children}</SiteAnchor>;
    },
    img({ src, alt }) {
      let url = typeof src === "string" ? resolveLink(source, src) : "";
      try {
        const candidate = decodeURIComponent(url).replace(/^\//, "");
        if (inventory().files.get(candidate)?.kind === "media") url = mediaURL(candidate);
      } catch { /* Malformed URL is left for the browser, never read as a path. */ }
      // Native images preserve source dimensions and work for notebook scans.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt={alt ?? ""} loading="lazy" />;
    },
  }}>{prepareMarkdown(source, markdown)}</Markdown></div>;
}
