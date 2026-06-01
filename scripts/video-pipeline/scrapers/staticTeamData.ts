/**
 * Transfermarkt scraper bot korumasına takılırsa veya değer hatalı çıkarsa
 * kullanılan statik referans verisi. Büyük WC2026 takımları için.
 */
import type { StarPlayer } from '../types';

export interface StaticTeamData {
  squadValue: string;
  avgAge: number;
  starPlayer: StarPlayer;
}

const STATIC_DATA: Record<string, StaticTeamData> = {
  'türkiye': {
    squadValue: '~€750M',
    avgAge: 26.3,
    starPlayer: { name: 'Arda Güler', value: '~€60M', age: 20, club: 'Real Madrid' },
  },
  'turkey': {
    squadValue: '~€750M',
    avgAge: 26.3,
    starPlayer: { name: 'Arda Güler', value: '~€60M', age: 20, club: 'Real Madrid' },
  },
  'brezilya': {
    squadValue: '~€900M',
    avgAge: 26.0,
    starPlayer: { name: 'Vinicius Jr.', value: '~€200M', age: 24, club: 'Real Madrid' },
  },
  'brazil': {
    squadValue: '~€900M',
    avgAge: 26.0,
    starPlayer: { name: 'Vinicius Jr.', value: '~€200M', age: 24, club: 'Real Madrid' },
  },
  'almanya': {
    squadValue: '~€850M',
    avgAge: 25.5,
    starPlayer: { name: 'Florian Wirtz', value: '~€150M', age: 21, club: 'Bayer Leverkusen' },
  },
  'germany': {
    squadValue: '~€850M',
    avgAge: 25.5,
    starPlayer: { name: 'Florian Wirtz', value: '~€150M', age: 21, club: 'Bayer Leverkusen' },
  },
  'fransa': {
    squadValue: '~€1.1B',
    avgAge: 26.8,
    starPlayer: { name: 'Kylian Mbappé', value: '~€180M', age: 26, club: 'Real Madrid' },
  },
  'france': {
    squadValue: '~€1.1B',
    avgAge: 26.8,
    starPlayer: { name: 'Kylian Mbappé', value: '~€180M', age: 26, club: 'Real Madrid' },
  },
  'arjantin': {
    squadValue: '~€780M',
    avgAge: 27.2,
    starPlayer: { name: 'Lionel Messi', value: '~€20M', age: 38, club: 'Inter Miami' },
  },
  'argentina': {
    squadValue: '~€780M',
    avgAge: 27.2,
    starPlayer: { name: 'Lionel Messi', value: '~€20M', age: 38, club: 'Inter Miami' },
  },
  'ispanya': {
    squadValue: '~€950M',
    avgAge: 25.0,
    starPlayer: { name: 'Lamine Yamal', value: '~€200M', age: 17, club: 'Barcelona' },
  },
  'spain': {
    squadValue: '~€950M',
    avgAge: 25.0,
    starPlayer: { name: 'Lamine Yamal', value: '~€200M', age: 17, club: 'Barcelona' },
  },
  'İngiltere': {
    squadValue: '~€1.0B',
    avgAge: 26.5,
    starPlayer: { name: 'Jude Bellingham', value: '~€180M', age: 21, club: 'Real Madrid' },
  },
  'england': {
    squadValue: '~€1.0B',
    avgAge: 26.5,
    starPlayer: { name: 'Jude Bellingham', value: '~€180M', age: 21, club: 'Real Madrid' },
  },
  'portekiz': {
    squadValue: '~€750M',
    avgAge: 27.0,
    starPlayer: { name: 'Cristiano Ronaldo', value: '~€15M', age: 40, club: 'Al Nassr' },
  },
  'portugal': {
    squadValue: '~€750M',
    avgAge: 27.0,
    starPlayer: { name: 'Cristiano Ronaldo', value: '~€15M', age: 40, club: 'Al Nassr' },
  },
  'hollanda': {
    squadValue: '~€650M',
    avgAge: 26.2,
    starPlayer: { name: 'Cody Gakpo', value: '~€70M', age: 25, club: 'Liverpool' },
  },
  'netherlands': {
    squadValue: '~€650M',
    avgAge: 26.2,
    starPlayer: { name: 'Cody Gakpo', value: '~€70M', age: 25, club: 'Liverpool' },
  },
  'fas': {
    squadValue: '~€350M',
    avgAge: 26.8,
    starPlayer: { name: 'Achraf Hakimi', value: '~€70M', age: 26, club: 'Paris Saint-Germain' },
  },
  'morocco': {
    squadValue: '~€350M',
    avgAge: 26.8,
    starPlayer: { name: 'Achraf Hakimi', value: '~€70M', age: 26, club: 'Paris Saint-Germain' },
  },
  'japonya': {
    squadValue: '~€350M',
    avgAge: 26.5,
    starPlayer: { name: 'Takefusa Kubo', value: '~€50M', age: 23, club: 'Real Sociedad' },
  },
  'japan': {
    squadValue: '~€350M',
    avgAge: 26.5,
    starPlayer: { name: 'Takefusa Kubo', value: '~€50M', age: 23, club: 'Real Sociedad' },
  },
  'meksika': {
    squadValue: '~€280M',
    avgAge: 27.0,
    starPlayer: { name: 'Santiago Giménez', value: '~€40M', age: 23, club: 'Milan' },
  },
  'mexico': {
    squadValue: '~€280M',
    avgAge: 27.0,
    starPlayer: { name: 'Santiago Giménez', value: '~€40M', age: 23, club: 'Milan' },
  },
  'abd': {
    squadValue: '~€300M',
    avgAge: 25.5,
    starPlayer: { name: 'Christian Pulisic', value: '~€45M', age: 26, club: 'Milan' },
  },
  'usa': {
    squadValue: '~€300M',
    avgAge: 25.5,
    starPlayer: { name: 'Christian Pulisic', value: '~€45M', age: 26, club: 'Milan' },
  },
};

export function getStaticTeamData(team: string): StaticTeamData | null {
  return STATIC_DATA[team.toLowerCase()] ?? null;
}
