import Link from 'next/link';
import { ADMIN_PAGES, type AdminCounterKey } from '@/config/adminPages';
import styles from './adminHome.module.scss';

export type AdminCounters = Partial<Record<AdminCounterKey, number>>;

/** Yönetici ana sayfası: her yönetici sayfası için başlık, tek satır açıklama, bağlantı ve (varsa) bekleyen iş rozeti. */
export default function AdminHome({ counters }: { counters: AdminCounters }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin paneli</h1>
      <ul className={styles.grid}>
        {ADMIN_PAGES.map((p) => {
          const n = p.counter ? counters[p.counter] : undefined;
          return (
            <li key={p.path}>
              <Link href={p.path} className={styles.card}>
                <span className={styles.head}>
                  <span className={styles.cardTitle}>{p.title}</span>
                  {n ? (
                    <span className={styles.badge} aria-label={`${n} bekleyen`}>
                      {n}
                    </span>
                  ) : null}
                </span>
                <span className={styles.desc}>{p.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
