import { socialProfiles, type SocialNetwork } from '@/config/brand';

/** Basit tek renk ikonlar (currentColor; 24×24 görünüm kutusu). Dış kütüphane yok: footer her sayfanın ilk yükünde. */
const ICONS: Record<SocialNetwork, string> = {
  instagram:
    'M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.2-.1 1.6-.1 4.8-.1zm0 4.7a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm5.3-9.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  youtube:
    'M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 4 12 4 12 4s-7.5 0-9.4.4A3 3 0 0 0 .5 6.5 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.5 3 3 0 0 0 2.1 2.1c1.9.4 9.4.4 9.4.4s7.5 0 9.4-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.5zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z',
  x: 'M18.2 2.3h3.4l-7.4 8.5 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.8 2.3h7l4.8 6.4 5.6-6.4zm-1.2 18h1.9L7 4.2H5l12 16.1z',
  facebook:
    'M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z',
  tiktok:
    'M16.6 0h-4v16.3a3.5 3.5 0 1 1-3.5-3.5c.3 0 .7 0 1 .1V8.8a7.6 7.6 0 1 0 6.5 7.5V8a9.6 9.6 0 0 0 5.6 1.8v-4A5.6 5.6 0 0 1 16.6 0z',
};

/** Footer sosyal hesap bağlantıları (config/brand.ts › BRAND.social; boş hesap gösterilmez). */
export default function SocialLinks({ className, linkClassName, label }: { className: string; linkClassName: string; label: string }) {
  const profiles = socialProfiles();
  if (profiles.length === 0) return null;
  return (
    <ul className={className} aria-label={label}>
      {profiles.map((p) => (
        <li key={p.network}>
          <a href={p.url} className={linkClassName} target="_blank" rel="noopener noreferrer me" aria-label={`${label}: ${p.label}`} title={p.label}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path fill="currentColor" d={ICONS[p.network]} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
