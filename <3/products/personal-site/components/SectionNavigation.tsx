"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { StackIcon, type Section } from "./StackIcon";
import styles from "./SiteShell.module.css";

const sections: { id: Section; href: string; label: string }[] = [
  { id: "personhood", href: "/", label: "personhood" },
  { id: "ai", href: "/π", label: "personal artificial intelligence" },
  { id: "stock", href: "/$", label: "personal stock" },
];

export function SectionNavigation() {
  const segment = useSelectedLayoutSegment();
  const pathname = `/${decodeURIComponent(segment ?? "")}`;
  const activeIndex = Math.max(0, sections.findIndex(({ href }) => href === pathname));

  return (
    <nav className={styles.navigation} aria-label="main navigation">
      <span
        className={styles.activeSegment}
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {sections.map((section, index) => (
        <Link
          key={section.id}
          href={section.href}
          className={styles.navLink}
          aria-label={section.label}
          aria-current={index === activeIndex ? "page" : undefined}
        >
          <StackIcon section={section.id} />
        </Link>
      ))}
    </nav>
  );
}
