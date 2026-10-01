import { useDelayedShow } from '@/hooks/useDelayedShow';
import FormationScene from './FormationScene';
import ScaledScene from './ScaledScene';
import styles from './formationLoading.module.scss';

/**
 * 02 · Diziliş kuruluyor — kadro alanı yüklenirken. Kutuyu (yerine geçtiği içerikle aynı boyut) ÇAĞIRAN tutar;
 * bu bileşen kutuyu doldurur, sahneyi ortalar ve genişliğe ölçekler. Çağıranlar next/dynamic ile yükler (ekranın
 * altında kalıyor; sahne CSS'i ana sayfa ilk yüküne girmesin). Animasyon 300 ms sonra; durum metni ekran okuyucuya.
 */
export default function FormationLoading({ label }: { label: string }) {
  const shown = useDelayedShow(300);
  return (
    <div className={styles.box} role="status">
      <span className={styles.srOnly}>{label}</span>
      <div className={`${styles.scene} ${shown ? '' : styles.waiting}`} aria-hidden="true">
        <ScaledScene>
          <FormationScene />
        </ScaledScene>
      </div>
    </div>
  );
}
