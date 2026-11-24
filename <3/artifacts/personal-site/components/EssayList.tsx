import Link from "next/link";
import styles from "./EssayList.module.css";

export type EssayListItem = {
  title: string;
  href: string;
  external?: boolean;
};

export function EssayList({ essays }: { essays: EssayListItem[] }) {
  if (essays.length === 0) return null;

  return (
    <ul className={styles.list}>
      {essays.map((essay) => (
        <li key={essay.href} className={styles.item}>
          {essay.external ? (
            <a
              href={essay.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {essay.title}
            </a>
          ) : (
            <Link href={essay.href} className={styles.link}>
              {essay.title}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
