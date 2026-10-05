import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import tr from '../../../public/locales/tr/kuralKosesi.json';
import en from '../../../public/locales/en/kuralKosesi.json';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { tabFromSearch } from '@/components/MatchDetailContent';
import AssistantCard from './AssistantCard';

vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));

const t = (key: string, opts?: Record<string, unknown>) => {
  let cur: unknown = tr;
  for (const k of key.split('.')) cur = (cur as Record<string, unknown>)?.[k];
  const v = typeof cur === 'string' ? cur : key;
  return opts ? v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? '')) : v;
};
const match = { id: 1, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: null, href: '/matches/1-galatasaray-kasimpasa?sekme=ai-analiz' };
const actions = { onChoose: () => {}, onUnlock: () => {} };
const render = (card: never, extra = {}) => renderToStaticMarkup(<AssistantCard card={card} t={t} actions={{ ...actions, ...extra }} />);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('AI Asistan kartı', () => {
  it('kilitli: önizleme + "1 kredi ile aç"; girişsizde giriş linki', () => {
    const card = { kind: 'locked', match, preview: { homeTeamName: 'Galatasaray', awayTeamName: 'Kasımpaşa', summary: ['Tempo yüksek.'], top: { outcome: 'HOME', pct: 55 } }, cost: 1, signedIn: true };
    const t1 = text(render(card as never));
    expect(t1).toContain('Ücretsiz önizleme');
    expect(t1).toContain('En olası sonuç: Galatasaray kazanır %55');
    expect(t1).toContain('1 kredi ile aç');
    expect(text(render({ ...card, signedIn: false } as never))).toContain('Analizi açmak için giriş yap');
    expect(text(render(card as never, { unlockError: 'insufficient' }))).toContain('Yetersiz kredi. Kredi satın al');
  });

  it('özet: en olası sonuç, noktalar ve maç sayfası AI sekmesi linki', () => {
    const html = render({ kind: 'summary', match, top: { outcome: 'AWAY', pct: 49 }, points: ['A noktası.', 'B noktası.'] } as never);
    expect(text(html)).toContain('En olası sonuç: Kasımpaşa kazanır %49');
    expect(html).toContain('href="/matches/1-galatasaray-kasimpasa?sekme=ai-analiz"');
  });

  it('analiz yok: "yaklaşık 3 saat önce" + maç sayfası', () => {
    const t1 = text(render({ kind: 'none', match } as never));
    expect(t1).toContain('Analiz maçtan yaklaşık 3 saat önce hazırlanır.');
    expect(t1).toContain('Maç sayfasına git');
  });

  it('metinlerde bahis terimi yok (TR/EN)', () => {
    expect(findGamblingTerms(JSON.stringify(tr))).toEqual([]);
    expect(findGamblingTerms(JSON.stringify(en))).toEqual([]);
  });

  it('maç sayfası derin bağlantısı: ?sekme=ai-analiz → AI Analiz sekmesi', () => {
    expect(tabFromSearch('?sekme=ai-analiz')).toBe('analysis');
    expect(tabFromSearch('?sekme=diger')).toBeNull();
    expect(tabFromSearch('')).toBeNull();
  });
});
