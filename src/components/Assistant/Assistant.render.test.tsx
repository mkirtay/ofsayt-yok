import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import tr from '../../../public/locales/tr/assistant.json';
import en from '../../../public/locales/en/assistant.json';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { tabFromSearch } from '@/components/MatchDetailContent';
import AssistantCard from './AssistantCard';
import { isAssistantHidden } from './openEvent';
import { parseSseBuffer } from './sse';

vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));

const t = (key: string, opts?: Record<string, unknown>) => {
  let cur: unknown = tr;
  for (const k of key.split('.')) cur = (cur as Record<string, unknown>)?.[k];
  const v = typeof cur === 'string' ? cur : key;
  return opts ? v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? '')) : v;
};
const match = { id: 1, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: null, href: '/matches/1-galatasaray-kasimpasa?sekme=ai-analiz' };
const actions = { onChoose: () => {}, onUnlock: () => {} };
const render = (card: unknown, extra = {}) => renderToStaticMarkup(<AssistantCard card={{ type: 'analysis', card } as never} t={t} actions={{ ...actions, ...extra }} />);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('AI Asistan kartları', () => {
  it('kilitli analiz: önizleme + "1 kredi ile aç"; girişsizde giriş linki; yetersiz kredi', () => {
    const card = { kind: 'locked', match, preview: { homeTeamName: 'Galatasaray', awayTeamName: 'Kasımpaşa', summary: ['Tempo yüksek.'], top: { outcome: 'HOME', pct: 55 } }, cost: 1, signedIn: true };
    const t1 = text(render(card));
    expect(t1).toContain('Ücretsiz önizleme');
    expect(t1).toContain('En olası sonuç: Galatasaray kazanır %55');
    expect(t1).toContain('1 kredi ile aç');
    expect(text(render({ ...card, signedIn: false }))).toContain('Analizi açmak için giriş yap');
    expect(text(render(card, { unlockError: 'insufficient' }))).toContain('Yetersiz kredi. Kredi satın al');
  });

  it('özet: en olası sonuç, noktalar, AI sekmesi linki; analiz yok: "yaklaşık 3 saat önce"', () => {
    const html = render({ kind: 'summary', match, top: { outcome: 'AWAY', pct: 49 }, points: ['A noktası.'] });
    expect(text(html)).toContain('En olası sonuç: Kasımpaşa kazanır %49');
    expect(html).toContain('href="/matches/1-galatasaray-kasimpasa?sekme=ai-analiz"');
    expect(text(render({ kind: 'none', match, reason: 'scheduled' }))).toContain('Analiz maçtan yaklaşık 3 saat önce hazırlanır.');
    const notPlanned = text(render({ kind: 'none', match, reason: 'not-planned' }));
    expect(notPlanned).toContain('Bu maç için analiz hazırlanmıyor.');
    expect(notPlanned).not.toContain('3 saat');
    expect(notPlanned).toContain('Maç sayfasına git');
  });

  it('maç kartı: skor / canlı dakika / kanal ve maç linki', () => {
    const html = renderToStaticMarkup(
      <AssistantCard
        t={t}
        actions={actions}
        card={{ type: 'matches', matches: [{ id: 2, home: 'A', away: 'B', kickoffMs: null, status: 'IN PLAY', score: '1-0', minute: '63', tv: ['beIN Sports 1'], href: '/matches/2-a-b' }] }}
      />,
    );
    expect(text(html)).toContain("A 1-0 B Canlı 63' · beIN Sports 1");
    expect(html).toContain('href="/matches/2-a-b"');
  });

  it('metinlerde bahis terimi yok (TR/EN); iki dilde aynı anahtarlar', () => {
    expect(findGamblingTerms(JSON.stringify(tr))).toEqual([]);
    expect(findGamblingTerms(JSON.stringify(en))).toEqual([]);
    const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as object, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });

  it('gizli sayfalar, derin bağlantı ve SSE ayrıştırma', () => {
    for (const p of ['/auth/signin', '/admin', '/odeme/tamamlandi']) expect(isAssistantHidden(p), p).toBe(true);
    for (const p of ['/', '/matches/[slug]', '/credits']) expect(isAssistantHidden(p), p).toBe(false);
    expect(tabFromSearch('?sekme=ai-analiz')).toBe('analysis');
    const parsed = parseSseBuffer('event: delta\ndata: {"text":"Mer"}\n\nevent: done\ndata: {"remaining":2}\n\nevent: del');
    expect(parsed.events).toEqual([{ event: 'delta', data: { text: 'Mer' } }, { event: 'done', data: { remaining: 2 } }]);
    expect(parsed.rest).toBe('event: del');
  });
});
