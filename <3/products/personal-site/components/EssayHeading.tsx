import styles from "./EssayHeading.module.css";

export function EssayHeading({ title, date }: { title: string; date?: string }) {
  return (
    <header className={styles.heading}>
      {date && <p className={styles.date}>{date}</p>}
      <h1 className={styles.title}>{title}</h1>
    </header>
  );
}
