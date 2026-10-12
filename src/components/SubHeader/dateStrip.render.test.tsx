/**
 * Mobil gün şeridi (SubHeader): bugün ±30 gün kaydırılabilir şerit, seçili gün tek sekme durağı ve aria ile işaretli,
 * "Bugün" kısayolu seçili gün bugün değilken. Render veri seçimi tetiklemez (onDateChange yalnız tıklamada).
 * Kaydırmanın istek atmadığı tarayıcıda ağ kaydıyla doğrulanır (bu ortamda DOM yok).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/hooks/useHideOnScroll', () => ({ useHideOnScroll: () => {} }));

import SubHeader from '@/components/SubHeader';
import { MOBILE_STRIP_RADIUS, shiftIsoDate } from '@/utils/dateStrip';

const TODAY = '2026-10-12';

function render(selectedDate: string, onDateChange = vi.fn()) {
  const html = renderToStaticMarkup(
    <SubHeader initialTodayIso={TODAY} selectedDate={selectedDate} onDateChange={onDateChange} activeTab="all" onTabChange={() => {}} />,
  );
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  return { html, tabs, onDateChange };
}

const isoOf = (tag: string) => /data-iso="([^"]+)"/.exec(tag)?.[1];

describe('mobil gün şeridi', () => {
  it('bugün ±30 gün (61 hücre), sıralı; seçili gün (bugün) aria-current/aria-selected ve tek sekme durağı', () => {
    const { tabs } = render(TODAY);
    expect(MOBILE_STRIP_RADIUS).toBe(30);
    expect(tabs).toHaveLength(2 * MOBILE_STRIP_RADIUS + 1);
    expect(isoOf(tabs[0]!)).toBe(shiftIsoDate(TODAY, -30));
    expect(isoOf(tabs[tabs.length - 1]!)).toBe(shiftIsoDate(TODAY, 30));
    const selected = tabs.filter((t) => t.includes('aria-current="date"'));
    expect(selected).toHaveLength(1);
    expect(isoOf(selected[0]!)).toBe(TODAY);
    expect(selected[0]).toContain('aria-selected="true"');
    expect(tabs.filter((t) => t.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(tabs.length - 1);
  });

  it('seçili gün bugün değilse: şeritte seçili ve "Bugün" kısayolu var; bugünse kısayol yok', () => {
    const other = render('2026-10-20');
    expect(other.tabs.filter((t) => t.includes('aria-current="date"')).map(isoOf)).toEqual(['2026-10-20']);
    expect(other.html).toMatch(/class="[^"]*stripToday/);
    expect(render(TODAY).html).not.toMatch(/class="[^"]*stripToday/);
  });

  it('takvimden pencere dışı gün: pencere o günün ±30\'una kayar, seçili gün şeritte; bugün yok, kısayol var', () => {
    const far = '2027-01-15';
    const { tabs, html } = render(far);
    expect(tabs).toHaveLength(61);
    expect(tabs.filter((t) => t.includes('aria-current="date"')).map(isoOf)).toEqual([far]);
    expect(tabs.some((t) => isoOf(t) === TODAY)).toBe(false);
    expect(html).toMatch(/class="[^"]*stripToday/);
  });

  it('render gün seçmez (veri çekme yalnız tıklamayla, onDateChange)', () => {
    const { onDateChange } = render('2026-10-01');
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('gün adları i18n/locale ile (TR kısaltma) ve bugün hücresi "Bugün"', () => {
    const { html } = render(TODAY);
    expect(html).toMatch(/Bugün/);
    expect(html).toMatch(/Pzt|Sal|Çar|Per|Cum|Cmt|Paz/);
  });
});
