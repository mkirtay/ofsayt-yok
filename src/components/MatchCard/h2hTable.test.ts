import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scss = readFileSync(path.resolve(__dirname, 'matchCard.module.scss'), 'utf8');
const tsx = readFileSync(path.resolve(__dirname, 'index.tsx'), 'utf8');
const col = (name: string) => Number(scss.match(new RegExp(`col\\.h2hCol${name} \\{\\s*width: ([\\d.]+)%`))?.[1]);

// En dar tablo (mobil) 520 px; hücre dolgusu 2 × 5 px. "19.09.2026" 11 px'te ≈ 63 px, "20:00" ≈ 32 px.
const MIN_TABLE = 520;
const inner = (pct: number) => (pct / 100) * MIN_TABLE - 10;

describe('karşılaşma geçmişi tablosu — mobilde tarih ve saat birleşmez', () => {
  it('kolon oranları toplamı 100; tarih ve saat en dar tabloda metne yetiyor', () => {
    const names = ['Date', 'Time', 'Status', 'Home', 'Score', 'Away', 'Ht'];
    expect(names.reduce((a, n) => a + col(n), 0)).toBeCloseTo(100, 5);
    expect(inner(col('Date'))).toBeGreaterThanOrEqual(64);
    expect(inner(col('Time'))).toBeGreaterThanOrEqual(33);
  });

  it('hiçbir hücre kırılmaz (satır yüksekliği sabit 24 px; "0-2" dar İY kolonunda bölünüyordu)', () => {
    expect(scss).toMatch(/tbody td \{[^}]*height: 24px;[^}]*white-space: nowrap;/);
    expect(tsx).toContain('<td className={styles.h2hTdDate}>');
    expect(tsx).toContain('<td className={styles.h2hTdTime}>');
  });
});
