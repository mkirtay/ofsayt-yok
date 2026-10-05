import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scss = readFileSync(path.resolve(__dirname, 'matchCard.module.scss'), 'utf8');
const tsx = readFileSync(path.resolve(__dirname, 'index.tsx'), 'utf8');
const col = (name: string) => Number(scss.match(new RegExp(`col\\.h2hCol${name} \\{\\s*width: ([\\d.]+)%`))?.[1]);

// En dar tablo (mobil) 400 px; hücre dolgusu 2 × 5 px. "19.09.2026" 11 px'te ≈ 63 px; "1-1 PEN" ≈ 48 px.
const MIN_TABLE = Number(scss.match(/\.h2hTable \{[^}]*min-width: (\d+)px/)?.[1]);
const inner = (pct: number) => (pct / 100) * MIN_TABLE - 10;

describe('karşılaşma geçmişi tablosu — Tarih · Ev sahibi · Skor · Deplasman · İY', () => {
  it('kolon oranları toplamı 100; tarih ve skor + UZS/PEN etiketi en dar tabloda metne yetiyor', () => {
    expect(MIN_TABLE).toBe(400);
    const names = ['Date', 'Home', 'Score', 'Away', 'Ht'];
    expect(names.reduce((a, n) => a + col(n), 0)).toBeCloseTo(100, 5);
    expect(inner(col('Date'))).toBeGreaterThanOrEqual(64);
    expect(inner(col('Score'))).toBeGreaterThanOrEqual(48);
    expect(scss).not.toMatch(/h2hColTime|h2hColStatus/);
  });

  it('hiçbir hücre kırılmaz (satır yüksekliği sabit 24 px); Saat ve Durum sütunu yok', () => {
    expect(scss).toMatch(/tbody td \{[^}]*height: 24px;[^}]*white-space: nowrap;/);
    expect(tsx).toContain('<td className={styles.h2hTdDate}>');
    expect(tsx).not.toContain('h2hTdTime');
    expect(tsx).not.toContain("t('h2hStatus')");
  });
});
