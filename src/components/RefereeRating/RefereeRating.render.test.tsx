import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import trMatch from '../../../public/locales/tr/match.json';
import enMatch from '../../../public/locales/en/match.json';

const session = vi.hoisted(() => ({ status: 'authenticated' as string }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: session.status, data: null }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ asPath: '/matches/x-19746609', push: vi.fn() }) }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: 'tr' }),
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k) }),
}));

// Oy verilmiş görünüm: bileşenin `null` başlangıçlı ilk state'i (sunucu yanıtı) sabit veriyle doldurulur.
const ratingState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let first = true;
  return {
    ...actual,
    useState: (init: unknown) => {
      if (init === null && ratingState.value && first) {
        first = false;
        return [ratingState.value, () => {}];
      }
      return actual.useState(init as never);
    },
  };
});

import RefereeRating from './index';

const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];
const decode = (s: string) => s.replace(/&quot;/g, '"');

afterEach(() => {
  ratingState.value = null;
  session.status = 'authenticated';
});

describe('RefereeRating', () => {
  it('10 düğme (1–10), hiçbiri seçili / devre dışı değil; oy vermeden ortalama görünmez', () => {
    const html = decode(renderToStaticMarkup(<RefereeRating matchId="1" refereeName="Halil Umut Meler" />));
    expect(buttons(html)).toHaveLength(10);
    expect(buttons(html).every((b) => b.includes('aria-pressed="false"') && !b.includes('disabled'))).toBe(true);
    expect(html).toContain('refereeRating.subtitle{"name":"Halil Umut Meler"}');
    expect(html).toContain('refereeRating.hint');
    expect(html).not.toContain('refereeRating.summary');
  });

  it('girişsiz: düğmeler yine görünür ve basılabilir, giriş ipucu', () => {
    session.status = 'unauthenticated';
    const html = renderToStaticMarkup(<RefereeRating matchId="1" />);
    expect(buttons(html)).toHaveLength(10);
    expect(buttons(html).some((b) => b.includes('disabled'))).toBe(false);
    expect(html).toContain('refereeRating.loginHint');
    expect(html).toContain('refereeRating.subtitleNoName');
  });

  it('oy verdikten sonra: ortalama (tr biçimi) + oy sayısı + kendi puanı, kendi düğmesi seçili', () => {
    ratingState.value = { average: 6.4, count: 37, userScore: 7 };
    const html = decode(renderToStaticMarkup(<RefereeRating matchId="1" />));
    expect(html).toContain('refereeRating.summary{"avg":"6,4","count":37}');
    expect(html).toContain('refereeRating.yourScore{"score":7}');
    const pressed = buttons(html).filter((b) => b.includes('aria-pressed="true"'));
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain('{"score":7}');
  });

  it('metinlerde kumar dili yok (TR + EN)', () => {
    for (const dict of [trMatch.refereeRating, enMatch.refereeRating]) {
      for (const v of Object.values(dict)) expect(findGamblingTerms(String(v))).toEqual([]);
    }
  });
});
