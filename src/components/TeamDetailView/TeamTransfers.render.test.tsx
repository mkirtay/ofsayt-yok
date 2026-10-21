import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TeamTransfers from './TeamTransfers';
import type { TeamTransfers as Data } from '@/services/sportmonks/teamTransfers';

const noop = () => {};

const DATA: Data = {
  incoming: [
    { id: 1, playerId: 10, playerName: 'Aleksey Batrakov', club: { id: 5, name: 'Lokomotiv Moskva' }, kind: 'permanent', date: '2026-08-20', fee: 25_000_000 },
    { id: 2, playerId: 11, playerName: 'Kazımcan Karataş', club: { id: 6, name: 'İstanbul Başakşehir' }, kind: 'loanReturn', date: '2026-06-30' },
  ],
  outgoing: [{ id: 3, playerId: 12, playerName: 'Sacha Boey', club: { id: 7, name: 'FC Bayern München' }, kind: 'loanReturn', date: '2026-06-30' }],
};

describe('<TeamTransfers />', () => {
  it('Gelenler / Gidenler, Türkçe tür (yöne göre kiralık dönüşü), bedel yalnız varsa, tarih', () => {
    const html = renderToStaticMarkup(<TeamTransfers data={DATA} loading={false} error={false} onRetry={noop} />);
    expect(html).toContain('Gelenler (2)');
    expect(html).toContain('Gidenler (1)');
    expect(html).toContain('>Bonservisli<');
    expect(html).toContain('>Kiralıktan dönüş<');
    expect(html).toContain('>Kiralık bitti<');
    expect(html).toContain('€25 mn');
    expect(html.match(/€/g)).toHaveLength(1);
    expect(html).toContain('<time dateTime="2026-08-20">20.08.2026</time>');
    expect(html).toContain('href="/players/10"');
  });

  it('hata → "yüklenemedi" + tekrar dene (transfer yok DEMEZ)', () => {
    const html = renderToStaticMarkup(<TeamTransfers data={null} loading={false} error onRetry={noop} />);
    expect(html).toContain('Transferler yüklenemedi.');
    expect(html).not.toContain('transfer yok');
  });

  it('boş veri → boş durum metni; bir yön boşsa o bölümde not', () => {
    expect(renderToStaticMarkup(<TeamTransfers data={{ incoming: [], outgoing: [] }} loading={false} error={false} onRetry={noop} />)).toContain(
      'Son 12 ayda kayda değer transfer yok.',
    );
    const html = renderToStaticMarkup(<TeamTransfers data={{ ...DATA, outgoing: [] }} loading={false} error={false} onRetry={noop} />);
    expect(html).toContain('Son 12 ayda giden oyuncu yok.');
  });
});
