import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { matchRowShowsStatus } from './index';

const t = (key: string) => ({ halfTime: 'İY', fullTime: 'MS' })[key] ?? key;
const m = (status: string, extra: Partial<Match> = {}) => ({ id: 1, status, time: '', ...extra }) as unknown as Match;

describe('mobil satır: saat ve durum aynı kolon', () => {
  it('canlı, devre arası ve bitmiş maçta durum gösterilir (saat yerine)', () => {
    expect(matchRowShowsStatus(m('IN PLAY', { time: "36'" }), t)).toBe(true);
    expect(matchRowShowsStatus(m('HALF TIME BREAK'), t)).toBe(true);
    expect(matchRowShowsStatus(m('FINISHED'), t)).toBe(true);
  });

  it('başlamamış maçta saat; ertelenen / iptal maçta saat kolonunda kısa etiket kalır', () => {
    expect(matchRowShowsStatus(m('NOT STARTED'), t)).toBe(false);
    expect(matchRowShowsStatus(m('NOT STARTED', { state_code: 'POSTPONED' } as Partial<Match>), t)).toBe(false);
    expect(matchRowShowsStatus(m('FINISHED', { state_code: 'CANCELLED' } as Partial<Match>), t)).toBe(false);
  });
});

describe('satır kolon geometrisi (< 1024 px): skor görsel merkezde', () => {
  const scss = readFileSync(path.resolve(__dirname, 'matchList.module.scss'), 'utf8');
  const px = (name: string) => Number(new RegExp(`\\$${name}:\\s*(\\d+)px`).exec(scss)?.[1]);
  const mobile = scss.slice(scss.indexOf('@include below-desktop {', scss.indexOf('$row-side-mobile')));

  it('< 640: sol kolon (saat|durum) = sağ blok (yıldız); ev / deplasman eşit, skor sabit', () => {
    expect(mobile).toMatch(/grid-template-columns:\s*\$row-side-mobile minmax\(0, 1fr\) \$row-score-mobile minmax\(0, 1fr\);/);
    expect(mobile).toMatch(/\.virtualMatchStar\s*\{[^}]*flex:\s*0 0 \$row-side-mobile;[^}]*border-left:\s*none/);
    expect(px('row-side-mobile')).toBeGreaterThanOrEqual(44); // yıldız dokunma alanı
  });

  it('640–1023: saat + durum = İY + yıldız', () => {
    expect(mobile).toMatch(
      /\$row-kickoff-tablet \$row-status-tablet minmax\(0, 1fr\) \$row-score-tablet minmax\(0, 1fr\)\s*\$row-ht-tablet;/,
    );
    expect(px('row-kickoff-tablet') + px('row-status-tablet')).toBe(px('row-ht-tablet') + px('row-side-mobile'));
  });
});
