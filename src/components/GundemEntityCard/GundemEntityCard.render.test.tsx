import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import GundemEntityCard, { entityCardHref, matchStatusLabel, overlayLiveMatch } from './index';
import PostCard from '@/components/PostCard';
import { findHubMatch } from '@/hooks/useHubMatchFromCache';
import { homeHubMatchesQueryKey } from '@/hooks/useHomeHubMatches';
import type { Match } from '@/models/liveScore';
import type { GundemMatchCard, GundemPlayerCard, GundemPost, GundemTeamCard } from '@/types/gundem';

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key);

const player: GundemPlayerCard = {
  type: 'PLAYER',
  id: 1001,
  name: 'Mauro Icardi',
  photo: 'https://cdn.sportmonks.com/images/soccer/players/1/1001.png',
  team: { id: 34, name: 'Galatasaray', logo: null },
  season: { name: '2026/2027', goals: 9, assists: 2, apps: 13 },
  lastRating: 8.24,
};
const team: GundemTeamCard = {
  type: 'TEAM',
  id: 34,
  name: 'Galatasaray',
  logo: null,
  standing: { leagueId: 600, leagueName: 'Süper Lig', leagueLogo: null, rank: 2, points: 28 },
};
const match: GundemMatchCard = {
  type: 'MATCH',
  id: 19134567,
  league: { id: 600, name: 'Süper Lig', logo: null },
  startingAt: '2026-11-08T17:00:00.000Z',
  status: 'IN PLAY',
  stateCode: null,
  minute: "67'",
  home: { id: 34, name: 'Galatasaray', logo: null },
  away: { id: 88, name: 'Fenerbahçe', logo: null },
  score: [2, 1],
};

function wrap(node: ReactNode, qc = new QueryClient()) {
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('<GundemEntityCard />', () => {
  it('oyuncu: ad, takım, gol/asist, puan rozeti; oyuncu sayfasına bağlanır', () => {
    const html = wrap(<GundemEntityCard card={player} />);
    expect(html).toContain('href="/players/1001"');
    expect(html).toContain('Mauro Icardi');
    expect(html).toContain('Galatasaray');
    expect(html).toMatch(/<b>9<\/b> gol/);
    expect(html).toMatch(/<b>2<\/b> asist/);
    expect(html).toContain('8.2');
    expect(html).toContain('Oyuncu: ');
  });

  it('takım: ad, lig, sıra; takım sayfasına bağlanır', () => {
    const html = wrap(<GundemEntityCard card={team} />);
    expect(html).toContain('href="/teams/34"');
    expect(html).toContain('Süper Lig');
    expect(html).toContain('2.');
    expect(html).toContain('28 P');
  });

  it('maç: lig, canlı durum, iki takım + skor, "Maça git"; maç sayfasına bağlanır', () => {
    const html = wrap(<GundemEntityCard card={match} />);
    expect(html).toContain(`href="${entityCardHref(match)}"`);
    expect(entityCardHref(match)).toBe('/matches/19134567-galatasaray-fenerbahce');
    expect(html).toContain("Canlı 67&#x27;");
    expect(html).toMatch(/Galatasaray<\/span><span[^>]*>2<\/span>/);
    expect(html).toContain('Maça git');
  });

  // Canlı katman yalnız istemcide (useSyncExternalStore sunucu anlık görüntüsü null): SSR/hidrasyon sunucu kartıyla aynı.
  // Katmanın kendisi aşağıda `overlayLiveMatch` + `findHubMatch` ile sınanır.
  it('maç: SSR çıktısı önbellekteki canlı listeden etkilenmez (hidrasyon uyumu)', () => {
    const qc = new QueryClient();
    const live: Match = { id: 19134567, status: 'IN PLAY', time: '81', home: { id: 34, name: 'Galatasaray' }, away: { id: 88, name: 'Fenerbahçe' }, scores: { score: '3-1' } };
    qc.setQueryData(homeHubMatchesQueryKey('2026-11-08'), { allMatches: [], liveMatches: [live], fixtureMatches: [], nightMatches: [] });
    const html = wrap(<GundemEntityCard card={match} />, qc);
    expect(html).toContain("Canlı 67&#x27;");
    expect(html).toMatch(/Galatasaray<\/span><span[^>]*>2<\/span>/);
  });

  it('PostCard: kart metnin altında; entity null/eksikse çizilmez', () => {
    const post: GundemPost = {
      id: 'p1',
      body: 'Icardi yine attı',
      createdAt: '2026-11-08T11:00:00.000Z',
      authorType: 'USER',
      matchId: null,
      match: null,
      teamId: null,
      author: { id: 'u', name: 'Ada', username: 'ada', image: null, official: false, followedByMe: false, followerCount: 0, followingCount: 0 },
      likes: 0,
      comments: 0,
      likedByMe: false,
      entity: player,
    };
    const html = wrap(<PostCard post={post} onToggleLike={() => {}} />);
    expect(html.indexOf('Icardi yine attı')).toBeLessThan(html.indexOf('data-entity="PLAYER"'));
    expect(wrap(<PostCard post={{ ...post, entity: null }} onToggleLike={() => {}} />)).not.toContain('data-entity');
    expect(wrap(<PostCard post={{ ...post, entity: undefined }} onToggleLike={() => {}} />)).not.toContain('data-entity');
  });
});

describe('overlayLiveMatch / matchStatusLabel / findHubMatch', () => {
  const live = (over: Partial<Match>): Match => ({ id: 19134567, status: 'IN PLAY', time: '70', home: { id: 34, name: 'G' }, away: { id: 88, name: 'F' }, ...over });

  it('geride kalan liste (canlı) bitmiş kartı geri almaz; ileri evre yazılır', () => {
    const ft = { ...match, status: 'FINISHED', minute: null, score: [3, 1] as [number, number] };
    expect(overlayLiveMatch(ft, live({ scores: { score: '2-1' } }))).toBe(ft);
    expect(overlayLiveMatch(match, live({ status: 'FINISHED', scores: { score: '2-2' } }))).toMatchObject({ status: 'FINISHED', minute: null, score: [2, 2] });
    expect(overlayLiveMatch(match, null)).toBe(match);
  });

  it('durum etiketleri', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(matchStatusLabel(match, t, 'tr', now)).toEqual({ text: `entity.liveMinute:{"minute":"67'"}`, tone: 'live' });
    expect(matchStatusLabel({ ...match, status: 'HALF TIME BREAK' }, t, 'tr', now).text).toBe('entity.halfTime');
    expect(matchStatusLabel({ ...match, status: 'FINISHED' }, t, 'tr', now)).toEqual({ text: 'entity.finished', tone: 'done' });
    expect(matchStatusLabel({ ...match, status: 'NOT STARTED', stateCode: 'POSTPONED' }, t, 'tr', now).text).toBe('entity.special.POSTPONED');
    // 17:00 UTC = 20:00 TSİ, aynı gün → yalnız saat
    expect(matchStatusLabel({ ...match, status: 'NOT STARTED' }, t, 'tr', now)).toEqual({ text: '20:00', tone: 'upcoming' });
    expect(matchStatusLabel({ ...match, status: 'NOT STARTED', startingAt: '2026-11-09T17:00:00.000Z' }, t, 'tr', now).text).toBe('9 Kas 20:00');
  });

  it('findHubMatch: canlı liste önce, yoksa null', () => {
    const a = live({ status: 'NOT STARTED' });
    const b = live({ status: 'IN PLAY' });
    expect(findHubMatch([undefined, { allMatches: [a], liveMatches: [b], fixtureMatches: [], nightMatches: [] }], 19134567)).toBe(b);
    expect(findHubMatch([{ allMatches: [a], liveMatches: [], fixtureMatches: [], nightMatches: [] }], 1)).toBeNull();
  });
});
