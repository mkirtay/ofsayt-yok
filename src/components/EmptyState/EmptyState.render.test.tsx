import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EmptyState from './index';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';

describe('<EmptyState />', () => {
  it('ikon + mesaj basar, role=status (hata rolü/alert değil)', () => {
    const html = renderToStaticMarkup(<EmptyState>Henüz yorum yok.</EmptyState>);
    expect(html).toContain('role="status"');
    expect(html).toContain('Henüz yorum yok.');
    expect(html).toContain('<svg');
    expect(html).not.toContain('role="alert"');
  });

  it('özel ikon ve className kabul eder', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={<i data-testid="x" />} className="extra">
        Mesaj
      </EmptyState>,
    );
    expect(html).toContain('data-testid="x"');
    expect(html).toContain('extra');
    expect(html).not.toContain('<svg');
  });
});

describe('Puan durumu widget — veri yokluğu EmptyState ile gösterilir', () => {
  it('data=null iken "Puan tablosu bulunamadı." EmptyState olarak render edilir', () => {
    const html = renderToStaticMarkup(<MatchCompetitionStandings data={null} competitionName="Süper Lig" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Puan tablosu bulunamadı.');
  });

  it('tablo boş satırlarla gelirse de EmptyState', () => {
    const html = renderToStaticMarkup(
      <MatchCompetitionStandings data={{ competition: { id: 6, name: 'Süper Lig' }, table: [] } as never} />,
    );
    expect(html).toContain('role="status"');
  });
});
