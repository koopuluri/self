import { SectionNavigation } from "./SectionNavigation";
import { WorkspaceMarkdown } from "./WorkspaceMarkdown";
import { readDocument } from "@/lib/workspace.mjs";
import styles from "./SiteShell.module.css";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const intro = readDocument("README.md");
  if (!intro) throw new Error("Missing workspace README.md");
  return <div className={styles.shell}>
    <header className={styles.header}><WorkspaceMarkdown source="README.md" markdown={intro.markdown} className={styles.intro} /></header>
    <hr className={styles.divider} /><SectionNavigation /><hr className={styles.divider} />
    <main className={styles.main}>{children}</main>
  </div>;
}
