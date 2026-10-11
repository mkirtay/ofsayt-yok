import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BotDraft } from '@/hooks/useBotDrafts';
import BotDraftCard from './BotDraftCard';

const draft = (o: Partial<BotDraft> = {}): BotDraft => ({
  id: 'd1', externalKey: 'goal:1:77', kind: 'GOAL', fixtureId: 1, eventId: 77, body: "⚽ GOL! 30' Icardi (Galatasaray)",
  facts: {
    kind: 'goal', playerName: 'Icardi', teamName: 'Galatasaray', minute: 30, extraMinute: null,
    homeName: 'Galatasaray', awayName: 'Fenerbahçe', score: { home: 1, away: 0 }, leagueName: 'Süper Lig', milestone: null,
  },
  warnings: [], status: 'PENDING', postId: null, createdAt: '2026-09-22T18:30:00.000Z', decidedAt: null, ...o,
});
const noop = vi.fn();
const render = (d: BotDraft) => renderToStaticMarkup(<BotDraftCard draft={d} onSave={noop} onApprove={noop} onReject={noop} />);

describe('BotDraftCard', () => {
  it('bekleyen taslak: maç adı, dakika, maç sayfası bağlantısı, düzenleme ve onay düğmeleri', () => {
    const html = render(draft());
    expect(html).toContain('Galatasaray 1-0 Fenerbahçe');
    expect(html).toContain("30&#x27; · Icardi · Süper Lig");
    expect(html).toContain('href="/matches/1"');
    expect(html).toContain('<textarea');
    expect(html).toContain('Onayla ve yayınla');
    expect(html).toContain('Reddet');
  });

  it('uyarılar listelenir', () => {
    expect(render(draft({ warnings: ['backlog: eski gol'] }))).toContain('backlog: eski gol');
  });

  it('bekleyen olmayan taslakta düzenleme/onay yok; yayınlanmışsa gönderi bağlantısı', () => {
    const html = render(draft({ status: 'POSTED', postId: 'cpost1' }));
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('Onayla ve yayınla');
    expect(html).toContain('href="/gundem/cpost1"');
    expect(html).toContain('Yayınlandı');
  });

  it('eskimiş (STALE) taslak etiketlenir', () => {
    expect(render(draft({ status: 'STALE' }))).toContain('Eskidi (VAR/iptal)');
  });

  it('toplu seçim: yalnız bekleyen kartta ve onToggleSelect verilmişse onay kutusu; seçili durum işaretlenir', () => {
    const view = (d: BotDraft, extra: Record<string, unknown> = {}) =>
      renderToStaticMarkup(<BotDraftCard draft={d} onSave={noop} onApprove={noop} onReject={noop} onToggleSelect={noop} {...extra} />);
    expect(view(draft())).toContain('type="checkbox"');
    expect(view(draft())).not.toContain('checked=""');
    expect(view(draft(), { selected: true })).toContain('checked=""');
    expect(view(draft({ status: 'POSTED', postId: 'p' }))).not.toContain('type="checkbox"');
    expect(render(draft())).not.toContain('type="checkbox"'); // onToggleSelect yok
  });

  it('gol dışı tür (PREVIEW/RECAP): dakika/oyuncu yerine tür etiketi', () => {
    const html = render(draft({ kind: 'PREVIEW', facts: { homeName: 'GS', awayName: 'FB', leagueName: 'Süper Lig' } as never }));
    expect(html).toContain('Maç öncesi · Süper Lig');
    expect(html).not.toContain('undefined');
  });
});
