/**
 * Koruma: eski markanın HİÇBİR yazımı (Ofsayt Yok, OFSAYT YOK, ofsaytyok, ofsayt-yok, OfsaytYok, Ofsayt-Yok,
 * ofsaytyok.app …) kodda, çevirilerde ve yapılandırmada geçmesin — marka `config/brand.ts`'ten okunur.
 * Geçebilecek tek yerler aşağıdaki açık izin listesi; her girdinin sınıfı ve nedeni var, envanter: docs/MARKA_GECISI.md.
 * Kapsam: git'te izlenen tüm metin dosyaları (yeni dosya `git add` sonrası girer; derleme klasörleri dışarıda kalsın diye);
 * `docs/` (belgeler) ve package-lock.json hariç.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LEGACY = /ofsayt[\s_.\-‐‑–]?yok/i;
const LEGACY_ALL = new RegExp(LEGACY.source, 'gi');

type Sinif =
  | 'kaynak' // marka tek kaynağı
  | 'test' // test fikstürleri
  | 'teknik' // iç/teknik kimlik: değiştirilmez
  | 'dis' // dış sistemdeki kimlik/adres: paneliyle birlikte değişir
  | 'bekleyen'; // kullanıcıya görünür ama başka oturumun alanı: geçiş günü değişecek

type Izin = {
  /** Repo köküne göre yol (tam eşleşme) ya da yol deseni. */
  path: string | RegExp;
  /** Satırda yalnız bu parçalar serbest; yoksa dosyanın tamamı serbest. */
  allow?: RegExp;
  sinif: Sinif;
  neden: string;
  /** Henüz olmayabilir (geçiş günü eklenecek ayar). */
  optional?: boolean;
};

export const LEGACY_BRAND_ALLOWLIST: Izin[] = [
  { path: 'src/config/brand.ts', sinif: 'kaynak', neden: 'Marka tek kaynağı; geçiş günü yalnız burası değişir.' },
  { path: /(\.test\.[cm]?[jt]sx?$|^src\/test\/)/, sinif: 'test', neden: 'Test fikstürleri (örnek URL, e-posta, UA); canlı çıktıyı doğrulayan testler BRAND okur.' },

  { path: 'src/components/PitchScenes/VarScene.tsx', allow: /OFSAYT YOK|Ofsayt yok/g, sinif: 'teknik', neden: 'VAR animasyon damgası: hakem kararı "ofsayt yok" (futbol terimi, marka değil).' },
  { path: 'src/components/PitchScenes/varScene.module.scss', allow: /Ofsayt yok/g, sinif: 'teknik', neden: 'VAR animasyonu yorum satırı (futbol terimi).' },
  { path: 'src/components/KuralKosesi/Panel.tsx', allow: /03-var-ofsayt-yok/g, sinif: 'teknik', neden: 'VAR animasyon kimliği (içerik JSON anahtarı).' },
  { path: 'src/components/KuralKosesi/facts.ts', allow: /03-var-ofsayt-yok/g, sinif: 'teknik', neden: 'VAR animasyon kimliği.' },
  { path: 'src/content/kural-kosesi.json', allow: /03-var-ofsayt-yok/g, sinif: 'teknik', neden: 'VAR animasyon kimliği.' },
  { path: 'src/components/WorldCupCalendar/index.tsx', allow: /@ofsaytyok\.app/g, sinif: 'teknik', neden: 'Takvim UID’si kalıcı; değişirse içe aktarılmış etkinlikler çiftlenir.' },
  { path: 'src/config/brandImages.ts', allow: /ofsaytyok-logo\.svg/g, sinif: 'teknik', neden: 'Logo dosya adı; yeni logo geldiğinde dosya ve bu yol birlikte değişir.' },
  { path: 'scripts/generate-brand-images.mjs', allow: /ofsaytyok-logo\.svg/g, sinif: 'teknik', neden: 'Logo dosya adı (görsel üretim betiği).' },
  { path: 'src/server/og/brandLogo.generated.ts', allow: /ofsaytyok-logo\.svg/g, sinif: 'teknik', neden: 'Üretilmiş dosyanın kaynak notu.' },
  { path: 'src/styles/_tokens.scss', allow: /OFSAYT_YOK_DESIGN_SYSTEM\.md/g, sinif: 'teknik', neden: 'Belge dosya adı referansı.' },
  { path: 'package.json', allow: /"name": "ofsayt-yok"/g, sinif: 'teknik', neden: 'npm paket adı (private, yayınlanmıyor).' },
  { path: 'scripts/seed-official-account.mjs', sinif: 'teknik', neden: 'DEPRECATED seed; DB’deki eski hesabın kimliği (e-posta/kullanıcı adı).' },

  {
    path: 'src/lib/gundem/official.ts',
    allow: /bilgi\.ofsaytyok@gmail\.com|ofsaytyokmedia|official@ofsaytyok\.invalid|"ofsaytyok"/g,
    sinif: 'dis',
    neden: 'Resmi Gündem hesabı (Gmail + DB kullanıcı adı); hesap taşınınca GUNDEM_BOT_EMAIL ile birlikte değişir.',
  },
  { path: 'src/pages/api/admin/gundem/bot-post.ts', allow: /bilgi\.ofsaytyok@gmail\.com/g, sinif: 'dis', neden: 'Resmi hesap e-postası (yorum).' },
  { path: '.github/workflows/evaluate-predictions.yml', allow: /ofsayt-yok\.vercel\.app/g, sinif: 'dis', neden: 'Vercel proje alan adı; proje adı değişmedikçe sabit.' },
  { path: 'next.config.ts', allow: /(www\.)?ofsaytyok\.app/g, sinif: 'dis', neden: 'Eski alan adından yeniye yönlendirme ayarı (geçiş günü eklenecek).', optional: true },

  { path: 'src/components/pitch3d/pitchKit.ts', allow: /OFSAYT YOK/g, sinif: 'bekleyen', neden: 'Saha reklam panosu yazısı (/auth, /frikik). pitch3d başka oturumda; geçiş günü BRAND’e bağlanacak.' },
  // optional: dosya frikik reklam panosu commit'iyle gelir; o commit henüz yayında değilken girdi bayat sayılmasın.
  { path: 'src/lib/frikik/ads.json', allow: /OFSAYT YOK/g, sinif: 'bekleyen', neden: 'Frikik reklam panosu metni; başka oturumda.', optional: true },
  { path: 'src/pages/frikik.tsx', allow: /'https:\/\/ofsaytyok\.app'/g, sinif: 'bekleyen', neden: 'Frikik canonical kökü; siteBaseUrl() ile değişecek (başka oturum).' },
  { path: 'public/locales/tr/frikik.json', allow: /\| Ofsayt Yok/g, sinif: 'bekleyen', neden: 'Frikik sayfa başlıkları; {{brand}} olacak (başka oturum).' },
  { path: 'public/locales/en/frikik.json', allow: /\| Ofsayt Yok/g, sinif: 'bekleyen', neden: 'Frikik sayfa başlıkları; {{brand}} olacak (başka oturum).' },
];

const ROOT = process.cwd();
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf|zip|gz|wasm|glb|gltf|bin)$/i;

const isFile = (f: string) => statSync(path.join(ROOT, f), { throwIfNoEntry: false })?.isFile() ?? false;

function scannedFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('docs/') && f !== 'package-lock.json' && !BINARY.test(f) && isFile(f));
}

const matchesPath = (rule: Izin, f: string) => (typeof rule.path === 'string' ? rule.path === f : rule.path.test(f));

describe('eski marka yazımları yalnız izin listesinde', () => {
  const used = new Set<Izin>();
  const offenders: string[] = [];

  for (const f of scannedFiles()) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    if (text.includes('\u0000') || !LEGACY.test(text)) continue;
    const rules = LEGACY_BRAND_ALLOWLIST.filter((r) => matchesPath(r, f));
    text.split('\n').forEach((line, i) => {
      if (!LEGACY.test(line)) return;
      const whole = rules.find((r) => !r.allow);
      if (whole) return void used.add(whole);
      let rest = line;
      for (const r of rules) {
        const stripped = rest.replace(r.allow!, '');
        if (stripped !== rest) used.add(r);
        rest = stripped;
      }
      if (LEGACY.test(rest)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)} → [${rest.match(LEGACY_ALL)?.join(', ')}]`);
    });
  }

  it('izin listesi dışında geçiş yok', () => {
    expect(offenders).toEqual([]);
  });

  it('izin listesinde bayat girdi yok (her zorunlu girdi en az bir geçişi karşılıyor)', () => {
    const stale = LEGACY_BRAND_ALLOWLIST.filter((r) => !r.optional && !used.has(r)).map((r) => String(r.path));
    expect(stale).toEqual([]);
  });

  it('desen bütün yazımları yakalar', () => {
    for (const s of ['Ofsayt Yok', 'OFSAYT YOK', 'ofsaytyok', 'ofsayt-yok', 'OfsaytYok', 'Ofsayt-Yok', 'ofsaytyok.app', 'OFSAYT_YOK', 'ofsayt.yok']) {
      expect(LEGACY.test(s), s).toBe(true);
    }
    expect(LEGACY.test('ofsayt yoktu ama')).toBe(true); // bilinçli: geniş desen, istisna izin listesinden
    expect(LEGACY.test('Ofsayt kuralı')).toBe(false);
  });
});
