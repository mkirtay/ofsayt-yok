import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import WelcomeCard from './WelcomeCard';
import { placeBubble } from './hintLayer';
import { FIRST_VISIT_KEY, ONBOARD_KEYS, WELCOME_ATTR, WELCOME_BOOT_SCRIPT, isIntroPending, isOnboardSeen, markOnboardSeen } from './storage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('onboarding depolama', () => {
  it('işaretlenmeyen görülmemiş; işaretlenince görüldü', () => {
    const s = memoryStorage();
    expect(isOnboardSeen('welcome', s)).toBe(false);
    markOnboardSeen('welcome', s);
    expect(isOnboardSeen('welcome', s)).toBe(true);
    expect(s.data.has(ONBOARD_KEYS.welcome)).toBe(true);
    expect(isOnboardSeen('aiTab', s)).toBe(false);
  });

  it('depolama yok / hata verir → gösterme (görüldü say), yazma sessizce geçer', () => {
    expect(isOnboardSeen('welcome', null)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(isOnboardSeen('favorite', broken)).toBe(true);
    expect(() => markOnboardSeen('favorite', broken)).not.toThrow();
  });
});

describe('isIntroPending (üye ol kartı tanıtımdan sonra)', () => {
  it('ilk ziyaret oturumunda tanıtım sürer; aynı oturumda tekrar sorulunca da', () => {
    const ls = memoryStorage();
    const ss = memoryStorage();
    expect(isIntroPending(ls, ss, 1)).toBe(true);
    expect(ls.data.get(FIRST_VISIT_KEY)).toBe('1');
    expect(isIntroPending(ls, ss, 2)).toBe(true);
  });

  it('karşılama kartı kapatılınca biter', () => {
    const ls = memoryStorage();
    const ss = memoryStorage();
    isIntroPending(ls, ss);
    markOnboardSeen('welcome', ls);
    expect(isIntroPending(ls, ss)).toBe(false);
  });

  it('sonraki ziyarette (yeni oturum) kart kapatılmamış olsa da biter', () => {
    const ls = memoryStorage();
    isIntroPending(ls, memoryStorage());
    expect(isIntroPending(ls, memoryStorage())).toBe(false);
  });

  it('depolama yok / hata → beklemez', () => {
    expect(isIntroPending(null, memoryStorage())).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(isIntroPending(broken, memoryStorage())).toBe(false);
  });
});

describe('WELCOME_BOOT_SCRIPT (boyamadan önce)', () => {
  function run(pathname: string, storage: { getItem(k: string): string | null } | 'throws') {
    const attrs = new Map<string, string>();
    const doc = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } };
    const ls =
      storage === 'throws'
        ? {
            getItem: () => {
              throw new Error('blocked');
            },
          }
        : storage;
    new Function('location', 'localStorage', 'document', WELCOME_BOOT_SCRIPT)({ pathname }, ls, doc);
    return attrs.has(WELCOME_ATTR);
  }

  it('ilk ziyarette ana sayfada özniteliği yazar', () => {
    expect(run('/', memoryStorage())).toBe(true);
  });
  it('kapatıldıysa, başka sayfada ya da depolama engelliyse yazmaz', () => {
    expect(run('/', memoryStorage({ [ONBOARD_KEYS.welcome]: '1' }))).toBe(false);
    expect(run('/gundem', memoryStorage())).toBe(false);
    expect(run('/', 'throws')).toBe(false);
  });
});

describe('<WelcomeCard /> sunucu çıktısı', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <WelcomeCard />
    </I18nProvider>,
  );

  it('başlık, üç satır ve iki düğme TR metinle; başlık bölgeyi adlandırır', () => {
    expect(html).toContain("Scor3&#x27;e hoş geldin 👋");
    expect(html).toContain('Bir maça dokun, AI analizini gör');
    expect(html).toContain('☆ ile takımını yıldızla, maçları üstte gör');
    expect(html).toContain('Gündem&#x27;de taraftarlarla konuş');
    expect(html).toContain('>Kısa tur</button>');
    expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"/);
    // Görünür ad erişilebilir adın içinde (WCAG 2.5.3).
    expect(html).toMatch(/aria-label="Anladım, karşılama kartını kapat"[^>]*>Anladım/);
  });

  it('gizli kart için ek CSS dışı stil / satır içi görünürlük yok (görünürlük ön-boyama özniteliğinde)', () => {
    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/\shidden[\s=>]/);
  });
});

describe('placeBubble', () => {
  const vp = { width: 375, height: 700 };
  const bubble = { width: 240, height: 90 };

  it('tercih "above" ve yer varsa üstte; ok öğenin ortasına bakar', () => {
    const p = placeBubble({ top: 400, bottom: 440, left: 100, width: 80 }, bubble, vp, 'above');
    expect(p.side).toBe('above');
    expect(p.top).toBe(400 - 10 - 90);
    expect(p.left + p.arrowX).toBe(140);
  });

  it('üstte yer yoksa alta geçer', () => {
    const p = placeBubble({ top: 60, bottom: 100, left: 100, width: 80 }, bubble, vp, 'above');
    expect(p.side).toBe('below');
    expect(p.top).toBe(110);
  });

  it('alt yığın (üye ol kartı) çıkarılmış yükseklikte "below" sığmazsa üste geçer', () => {
    const p = placeBubble({ top: 420, bottom: 460, left: 100, width: 80 }, bubble, { width: 375, height: 812 - 300 }, 'below');
    expect(p.side).toBe('above');
    expect(p.top + bubble.height).toBeLessThanOrEqual(420);
  });

  it('375 px ekranda yatayda kenarlara kıstırılır (sağ kenardaki düğme)', () => {
    const p = placeBubble({ top: 600, bottom: 656, left: 303, width: 56 }, bubble, vp, 'auto');
    expect(p.left).toBe(375 - 12 - 240);
    expect(p.side).toBe('above');
    expect(p.arrowX).toBeLessThanOrEqual(240 - 16);
  });
});

describe('onboarding metinleri', () => {
  const load = (lang: string) =>
    JSON.parse(readFileSync(path.resolve(__dirname, `../../../public/locales/${lang}/common.json`), 'utf8')).onboarding as Record<string, string>;
  const tr = load('tr');
  const en = load('en');

  it('TR ve EN aynı anahtarlara sahip', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it('bahis dili yok', () => {
    for (const v of [...Object.values(tr), ...Object.values(en)]) expect(findGamblingTerms(v)).toEqual([]);
  });
});

