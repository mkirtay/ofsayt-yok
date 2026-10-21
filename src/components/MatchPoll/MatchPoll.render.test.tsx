import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import trMatch from '../../../public/locales/tr/match.json';
import enMatch from '../../../public/locales/en/match.json';

const session = vi.hoisted(() => ({ data: { user: { id: 'u1' } } as unknown }));
vi.mock('next-auth/react', () => ({ useSession: () => session }));
// t: anahtarı, seçenek varsa "anahtar{json}" biçiminde döndürür (interpolasyon değerleri görünsün).
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k) }),
}));

// Oy sonucu görünümü: anketin tek `null` başlangıçlı state'i (poll) sabit veriyle doldurulur — fetch effect'i SSR'da çalışmaz.
const pollState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (init: unknown) =>
      init === null && pollState.value ? [pollState.value, () => {}] : actual.useState(init as never),
  };
});

import MatchPoll from './index';

const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const GS = { name: 'Galatasaray', logo: 'https://cdn.sportmonks.com/images/soccer/teams/2/34.png' };
const FB = { name: 'Fenerbahçe', logo: 'https://cdn.sportmonks.com/images/soccer/teams/24/88.png' };

afterEach(() => {
  pollState.value = null;
});

describe('MatchPoll kilidi', () => {
  it('açık: girişli kullanıcıda butonlar aktif, normal alt başlık', () => {
    const html = renderToStaticMarkup(<MatchPoll matchId="1" />);
    expect(buttons(html)).toHaveLength(3);
    expect(buttons(html).some((b) => b.includes('disabled'))).toBe(false);
    expect(html).toContain('poll.subtitle<');
  });

  it('kilitli: butonlar devre dışı, kilit alt başlığı, giriş çağrısı yok', () => {
    session.data = null;
    const html = renderToStaticMarkup(<MatchPoll matchId="1" locked />);
    expect(buttons(html).every((b) => b.includes('disabled'))).toBe(true);
    expect(html).toContain('poll.subtitleLocked');
    expect(html).not.toContain('poll.loginCta');
    session.data = { user: { id: 'u1' } };
  });
});

describe('MatchPoll takım etiketleri', () => {
  it('takımlar varsa seçenekler logo + takım adı; aria-label "X kazanır" / Beraberlik', () => {
    const html = decode(renderToStaticMarkup(<MatchPoll matchId="1" home={GS} away={FB} />));
    const b = buttons(html);
    expect(b[0]).toContain('aria-label="poll.teamWins{"team":"Galatasaray"}"');
    expect(b[1]).toContain('aria-label="poll.draw"');
    expect(b[2]).toContain('aria-label="poll.teamWins{"team":"Fenerbahçe"}"');
    expect(b[0]).toContain('title="Galatasaray"');
    expect(html).toContain('>Galatasaray</span>');
    expect(html).toContain('>Fenerbahçe</span>');
    expect(html.match(/<img[^>]*>/g)).toHaveLength(2);
    expect(html).not.toContain('poll.home');
    expect(html).not.toContain('poll.away');
    expect(html).toContain('teamMode');
  });

  it('dar ekran sığdırma sınıfları: çok kelimeli ad iki satır, uzun tek kelime küçük punto', () => {
    const html = renderToStaticMarkup(
      <MatchPoll matchId="1" home={{ name: 'Sincan Belediyesi Ankaraspor', logo: null }} away={{ name: 'Kastamonuspor', logo: null }} />,
    );
    expect(html).toMatch(/voteBtnTextMulti[^"]*">Sincan Belediyesi Ankaraspor</);
    expect(html).toMatch(/voteBtnTextLongWord[^"]*">Kastamonuspor</);
    const short = renderToStaticMarkup(<MatchPoll matchId="1" home={GS} away={FB} />);
    expect(short).not.toContain('voteBtnTextMulti');
    expect(short).not.toContain('voteBtnTextLongWord');
  });

  it('logo yoksa yer tutucu çizilir, ad yine görünür', () => {
    const html = renderToStaticMarkup(<MatchPoll matchId="1" home={{ name: 'Galatasaray', logo: null }} away={FB} />);
    expect(html.match(/<img[^>]*>/g)).toHaveLength(1);
    expect(html).toContain('voteBtnLogoFallback');
    expect(html).toContain('>Galatasaray</span>');
  });

  it('takım verisi yoksa ya da eksikse eski "Ev Sahibi / Deplasman" metni', () => {
    for (const props of [{}, { home: GS }, { home: GS, away: { name: '  ', logo: null } }]) {
      const html = renderToStaticMarkup(<MatchPoll matchId="1" {...props} />);
      expect(html).toContain('>poll.home</span>');
      expect(html).toContain('>poll.away</span>');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('teamMode');
    }
  });

  it('oy sonrası sonuç görünümünde de takım etiketleri + yüzde; aria-label yüzdeyi içerir', () => {
    pollState.value = { home: 6, draw: 2, away: 2, total: 10, userPrediction: 'HOME' };
    const html = decode(renderToStaticMarkup(<MatchPoll matchId="1" home={GS} away={FB} />));
    const b = buttons(html);
    expect(b[0]).toContain('aria-pressed="true"');
    expect(b[0]).toMatch(/aria-label="poll\.optionResult\{"label":"poll\.teamWins.*Galatasaray.*","pct":60\}"/);
    expect(b[2]).toContain('"pct":20');
    expect(html).toContain('>Galatasaray</span>');
    expect(html).toContain('60%');
    expect(html.match(/<img[^>]*>/g)).toHaveLength(2);
  });

  it('anket metinlerinde bahis dili yok (TR + EN)', () => {
    for (const poll of [trMatch.poll, enMatch.poll]) {
      expect(findGamblingTerms(Object.values(poll).join(' \n '))).toEqual([]);
    }
  });
});
