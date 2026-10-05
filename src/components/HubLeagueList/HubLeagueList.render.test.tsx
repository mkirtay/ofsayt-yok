import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import HubLeagueList from './index';

describe('<HubLeagueList /> (yan panel lig seçicisinin listesi)', () => {
  const html = renderToStaticMarkup(
    <HubLeagueList
      selectedId={-636}
      onSelect={() => {}}
      matchCountByLeague={new Map([[636, 6], [648, 1]])}
      apiLogoByLeague={new Map([[648, 'https://cdn.sportmonks.com/images/soccer/leagues/8/648.png']])}
    />,
  );

  it('34 lig satırı, 6 grup başlığı ve arama kutusu', () => {
    expect(html.match(/data-league-id="/g)).toHaveLength(34);
    expect(html.match(/<h3 /g)).toHaveLength(6);
    expect(html).toContain('placeholder="Lig veya ülke ara"');
    expect(html).toContain('>Amerika</h3>');
  });

  it('bugün maçı olan ligde sayı rozeti; olmayanda yok', () => {
    expect(html).toMatch(/data-league-id="636"[^]*?title="6 maç">6</);
    expect(html).toMatch(/data-league-id="648"[^]*?title="1 maç">1</);
    const row = (id: number) => html.split('<li>').find((li) => li.includes(`data-league-id="${id}"`))!;
    expect(row(636)).toContain('title="6 maç"');
    expect(row(600)).not.toContain(' maç"');
  });

  it('seçili lig işaretli (negatif id = legacy eşlemesi olmayan plan ligi)', () => {
    expect(html).toMatch(/aria-current="true" data-league-id="636"/);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it('logolar tembel; koyu şeffaf logoda (Premier League) koyu tema zemini sınıfı', () => {
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBe(34);
    expect(imgs.every((i) => i.includes('loading="lazy"'))).toBe(true);
    expect(html).toMatch(/data-league-id="8"><img [^>]*class="[^"]*logoBackdrop/);
    expect(html).not.toMatch(/data-league-id="648"><img [^>]*class="[^"]*logoBackdrop/);
    const scss = readFileSync(path.resolve(__dirname, 'hubLeagueList.module.scss'), 'utf8');
    expect(scss).toMatch(/\.logoBackdrop \{\s*@include logo-backdrop/);
  });

  it('satırlar ve grup başlıkları sabit yükseklikte', () => {
    const scss = readFileSync(path.resolve(__dirname, 'hubLeagueList.module.scss'), 'utf8');
    expect(scss).toMatch(/\.item \{[^}]*height: 44px;/);
    expect(scss).toMatch(/\.groupTitle \{[^}]*height: 30px;/);
  });

  it('seçici açılınca aramaya odaklanır (autoFocus yalnız istenince)', () => {
    expect(html).not.toMatch(/<input[^>]*autofocus/i);
    const focused = renderToStaticMarkup(
      <HubLeagueList selectedId={6} onSelect={() => {}} matchCountByLeague={new Map()} apiLogoByLeague={new Map()} autoFocusSearch />,
    );
    expect(focused).toMatch(/<input[^>]*autofocus/i);
  });
});
