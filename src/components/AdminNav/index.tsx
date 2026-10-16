import Link from 'next/link';
import styles from './adminNav.module.scss';

/** Yönetici sayfalarının üstündeki küçük gezinme çubuğu: "← Admin paneli" geri bağlantısı. Yalnız /admin/* sayfalarında. */
export default function AdminNav() {
  return (
    <nav className={styles.nav} aria-label="Yönetici gezinmesi">
      <Link href="/admin" className={styles.back}>
        <span aria-hidden="true">←</span> Admin paneli
      </Link>
    </nav>
  );
}
