import { AVATAR_GALLERY, avatarUrl, galleryPathOf } from '@/lib/avatars';
import { useTranslation } from '@/lib/i18n';
import styles from './profile.module.scss';

type Props = { value: string; onChange: (url: string) => void; name: string };

/** Profil görseli: hazır galeri (dosya yükleme YOK) + kendi URL'ni yapıştır — yan yana. */
export default function AvatarPicker({ value, onChange, name }: Props) {
  const { t } = useTranslation('profile');
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t('avatar.title')}</span>
      <div className={styles.avatarWrap}>
        <div className={styles.avatarPreview} aria-hidden="true">
          {value ? <img src={value} alt="" className={styles.avatarPreviewImg} /> : initial}
        </div>
        <div className={styles.avatarBody}>
          <div className={styles.avatarGrid} role="radiogroup" aria-label={t('avatar.gallery')}>
            {AVATAR_GALLERY.map((id) => {
              const url = avatarUrl(id);
              const active = galleryPathOf(value) === url;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={t(`avatar.names.${id}`)}
                  title={t(`avatar.names.${id}`)}
                  className={`${styles.avatarBtn} ${active ? styles.avatarBtnActive : ''}`.trim()}
                  onClick={() => onChange(url)}
                >
                  <img src={url} alt="" width={44} height={44} />
                </button>
              );
            })}
          </div>
          <label className={styles.label} htmlFor="image">
            {t('avatar.orUrl')}
          </label>
          <input
            id="image"
            className={styles.input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('profileImagePlaceholder')}
          />
          {value ? (
            <button type="button" className={styles.linkBtn} onClick={() => onChange('')}>
              {t('avatar.remove')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
