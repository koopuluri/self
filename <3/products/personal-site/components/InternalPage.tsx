"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import profile from "@/content/profile.json";
import styles from "./InternalPage.module.css";

export function InternalPage({ children }: { children: React.ReactNode }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLAnchorElement>(null);
  const [overlapsContent, setOverlapsContent] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useLayoutEffect(() => {
    const page = pageRef.current;
    const home = homeRef.current;
    const main = page?.querySelector("main");
    if (!page || !home || !main) return;

    const measure = () => {
      const photo = home.getBoundingClientRect();
      const content = main.getBoundingClientRect();
      const style = getComputedStyle(main);
      const left = content.left + parseFloat(style.paddingLeft);
      const right = content.right - parseFloat(style.paddingRight);
      setOverlapsContent(photo.right > left && photo.left < right);
    };
    measure();
    const updateScroll = () => setScrolled(window.scrollY > 0);
    updateScroll();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    observer.observe(main);
    observer.observe(home);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", updateScroll);
    };
  }, [pathname]);

  return (
    <div className={styles.page} ref={pageRef}>
      <header className={styles.navbar} data-overlap={overlapsContent} data-scrolled={scrolled}>
        <nav className={styles.navigation} aria-label="home navigation">
          <Link href="/" className={styles.home} aria-label="back home" ref={homeRef}>
            <Image src="/profile.png" alt={profile.name} width={48} height={48} priority />
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
