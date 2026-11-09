/* eslint-disable @next/next/no-img-element -- original media is served without image proxy costs */
import Link from "next/link";
import { notFound } from "next/navigation";
import { canonicalPath, encodePath, inventory, mediaURL, readDocument, resolveLink } from "@/lib/workspace.mjs";
import { WorkspaceMarkdown } from "./WorkspaceMarkdown";
import { EssayHeading } from "./EssayHeading";
import styles from "./GhostEssay.module.css";

export function DirectoryContent({ directory }: { directory: string }) {
  const { files, directories } = inventory();
  if (!directories.has(directory)) notFound();
  const source = directory + "/README.md";
  const doc = readDocument(source);
  const prefix = directory + "/";
  const children = [
    ...[...directories].filter(item => item.startsWith(prefix) && !item.slice(prefix.length).includes("/"))
      .map(item => ({ title: item.slice(prefix.length) + "/", href: encodePath(item) })),
    ...[...files.keys()].filter(item => item.startsWith(prefix) && !item.slice(prefix.length).includes("/") && item !== source)
      .map(item => ({ title: readDocument(item)?.title ?? item.slice(prefix.length), href: canonicalPath(item) })),
  ].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  // Keep authored navigation and also expose children it does not mention.
  const linked = new Set([...((doc?.markdown ?? "").matchAll(/\[[^\]]+\]\(([^)]+)\)/g))]
    .map(match => resolveLink(source, match[1].replace(/^<|>$/g, ""))));
  const unlisted = children.filter(child => !linked.has(child.href));
  return <>
    {doc ? <WorkspaceMarkdown source={source} markdown={doc.markdown} /> : <h1>{directory.split("/").at(-1)}</h1>}
    {unlisted.length > 0 && <ul className={styles.files} aria-label="directory contents">{unlisted.map(child => <li key={child.href}><Link href={child.href}>{child.title}</Link></li>)}</ul>}
  </>;
}

export function WorkspacePage({ source, directory = false }: { source: string; directory?: boolean }) {
  if (directory) return <main className={styles.page}><div className={styles.body}><DirectoryContent directory={source.replace(/\/README\.md$/, "")} /></div></main>;
  const entry = inventory().files.get(source);
  if (!entry) notFound();
  const parent = source.split("/").slice(0, -1).join("/");
  if (entry.kind === "media") {
    const url = mediaURL(source);
    return <main className={styles.page}><div className={styles.body}>
      <a href={encodePath(parent)}>{parent}/</a><h1>{source.split("/").at(-1)}</h1>
      {/\.(png|jpe?g|webp|gif|svg)$/i.test(source) && <img src={url} alt={source.split("/").at(-1)} />}
      {/\.(mp4|webm|mov|m4v)$/i.test(source) && <video className={styles.video} src={url} controls playsInline preload="metadata" />}
      {/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(source) && <audio src={url} controls preload="metadata" />}
      <a href={url}>open original</a>
    </div></main>;
  }
  const doc = readDocument(source);
  if (!doc) notFound();
  return <main className={styles.page}><article>
    {source.startsWith("<3/essays/") ? <EssayHeading title={doc.title} date={doc.date} /> : <p className={styles.breadcrumb}><Link href={encodePath(parent)}>{parent || "self"}/</Link></p>}
    {doc.code !== undefined ? <div className={styles.body}><h1>{doc.title}</h1><pre><code>{doc.code}</code></pre></div> : <WorkspaceMarkdown source={source} markdown={doc.markdown} />}
  </article></main>;
}
