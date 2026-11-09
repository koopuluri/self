import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EssayHeading } from "./EssayHeading";
import styles from "./GhostEssay.module.css";

export default function GhostEssay({ essay, markdown }: {
  essay: { title: string; date?: string };
  markdown: string;
}) {
  return (
    <main className={styles.page}>
      <article>
        <EssayHeading title={essay.title} date={essay.date} />
        <div className={styles.body}>
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              a({ href, title, children }) {
                // An explicit Markdown link title opts into inline playback.
                if (title === "video" && href && /\.(mp4|webm)(?:[?#]|$)/i.test(href)) {
                  return (
                    <video
                      className={styles.video}
                      src={href}
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={typeof children === "string" ? children : "video"}
                    >
                      <a href={href}>{children}</a>
                    </video>
                  );
                }
                return <a href={href} title={title}>{children}</a>;
              },
            }}
          >{markdown}</Markdown>
        </div>
      </article>
    </main>
  );
}
