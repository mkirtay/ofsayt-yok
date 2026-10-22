import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import lineupSample from '@/services/sportmonks/__fixtures__/commentaryLineup19746587.json';
import sample from '@/services/sportmonks/__fixtures__/commentarySuperLig.json';
import { classifyScene, normalizeCommentary, type CommentaryItem, type RawComment } from '@/services/sportmonks/matchCommentary';
import {
  buildSceneSquads,
  resolveSceneSides,
  type RawFormation,
  type RawLineupRow,
  type RawParticipant,
} from '@/services/sportmonks/commentaryScene';
import CommentaryScene from './CommentaryScene';
import { CommentaryView } from './index';

const lineup = lineupSample as { participants: RawParticipant[]; formations: RawFormation[]; lineups: RawLineupRow[] };
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;
const items = resolveSceneSides(normalizeCommentary((sample as Record<string, RawComment[]>)['19746587']), squads);

const item = (en: string, id = 1): CommentaryItem => ({
  id,
  order: id,
  minute: 12,
  extraMinute: null,
  kind: 'shot',
  important: false,
  en,
  tr: null,
  scene: { ...classifyScene(en, id)!, side: 'away' },
});

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const dots = (markup: string) => (markup.match(/class="[^"]*_dot_/g) ?? []).length;

const players = (markup: string) => (markup.match(/data-pl="/g) ?? []).length;

describe('<CommentaryScene /> — mini maç', () => {
  it('22 oyuncu, top, hakem ve sabit "temsili" notu', () => {
    const markup = html(<CommentaryScene item={item("Gabriel Sara takes a left-footed shot, but it's saved.")} squads={squads} />);
    expect(players(markup)).toBe(22);
    expect(markup).toContain('data-ball');
    expect(markup).toContain('data-ref');
    expect(markup).toContain('Temsili canlandırma – gerçek konumlar değil');
  });

  it('saha ekran okuyuculara gizli (yanındaki anlatım metni zaten okunuyor)', () => {
    const markup = html(<CommentaryScene item={item('Corner awarded.', 2)} squads={squads} />);
    expect(markup).toContain('aria-hidden="true"');
  });

  it('kart sahnesinde sarı kart efekti', () => {
    const markup = html(<CommentaryScene item={item('Victor James Osimhen receives a yellow card.', 3)} squads={squads} />);
    expect(markup).toContain('_fxCard_');
    expect(markup).toContain('_cardYellow_');
  });

  it('gol sahnesinde gol efekti ve şut izi', () => {
    const markup = html(<CommentaryScene item={item('Goal! Victor James Osimhen scores, making it 0-1.', 4)} squads={squads} />);
    expect(markup).toContain('_fxGoal_');
    expect(markup).toContain('_trailShot_');
  });

  it('kadro gelmezse sahne yine çizilir (varsayılan diziliş)', () => {
    const markup = html(<CommentaryScene item={item('Corner awarded.', 5)} squads={null} />);
    expect(players(markup)).toBe(22);
  });

  it('animasyonsuz (sunucu / WAAPI yok) son kare: konumlar satır içi transform', () => {
    const markup = html(<CommentaryScene item={item("Gabriel Sara takes a left-footed shot, but it's saved.", 6)} squads={squads} />);
    expect(markup).toMatch(/data-pl="0"[^>]*style="transform:translate\(-?[\d.]+px, -?[\d.]+px\)"|style="transform:translate\(-?[\d.]+px, -?[\d.]+px\)"[^>]*data-pl="0"/);
  });
});

describe('<CommentaryView /> — sahneli satırlar', () => {
  const sceneItem = items.find((i) => i.scene)!;

  it('onSelect verilince sahnesi olan satır düğme olur, seçili satır aria-pressed', () => {
    const markup = html(
      <CommentaryView items={items} live={false} filter="all" onFilter={() => {}} locale="tr" selectedId={sceneItem.id} onSelect={() => {}} />,
    );
    // Öznitelik sırası React'in ürettiği sıraya bağlı: önce satır düğmelerini ayıkla, sonra aria-pressed'e bak.
    const rows = [...markup.matchAll(/<button[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /_row_/.test(tag))
      .map((tag) => /aria-pressed="(true|false)"/.exec(tag)?.[1]);
    expect(rows.length).toBe(items.filter((i) => i.scene).length);
    expect(rows.filter((r) => r === 'true')).toHaveLength(1);
    expect(markup).toContain('Sahneyi oynat');
  });

  it('onSelect yoksa satırlar düğme değil (sahne yüklenmemişken tıklanamaz)', () => {
    const markup = html(<CommentaryView items={items} live={false} filter="all" onFilter={() => {}} locale="tr" />);
    expect([...markup.matchAll(/<button[^>]*>/g)].filter((m) => /_row_/.test(m[0]))).toEqual([]);
    expect(markup).not.toContain('Sahneyi oynat');
  });

  it('sahnesi olmayan satır (ofsayt, devre sonu) düğme olmaz', () => {
    const noScene = items.filter((i) => !i.scene);
    const markup = html(
      <CommentaryView items={noScene} live={false} filter="all" onFilter={() => {}} locale="tr" selectedId={null} onSelect={() => {}} />,
    );
    expect([...markup.matchAll(/<button[^>]*>/g)].filter((m) => /_row_/.test(m[0]))).toEqual([]);
  });
});

describe('<CommentaryScene kickoff />', () => {
  it('bekleme sahnesi: 22 nokta, orta yuvarlakta halka, diziliş notu', () => {
    const markup = html(<CommentaryScene item={null} squads={null} kickoff />);
    expect(dots(markup)).toBe(22);
    expect(markup).toContain('_ring_');
    expect(markup).toContain('Temsili diziliş – ilk düdük bekleniyor');
    expect(markup).toContain('data-scene="kickoff"');
  });

  it('bekleme sahnesinde kart/parlama/kurtarış yok, top var', () => {
    const markup = html(<CommentaryScene item={null} squads={null} kickoff />);
    expect(markup).toContain('_ballPath_');
    expect(markup).not.toContain('_cardYellow_');
    expect(markup).not.toContain('_flash_');
    expect(markup).not.toContain('_save_');
  });

  it('item yok ve kickoff kapalıysa hiç çizilmez', () => {
    expect(html(<CommentaryScene item={null} squads={null} />)).toBe('');
  });
});
