import { describe, expect, it } from 'vitest';
// .mjs betiği: saf plan/maske fonksiyonları test edilir, DB'ye bağlanılmaz.
import { maskEmail, planBackfill } from '../../../scripts/backfill-email-normalized.mjs';

type Row = { id: string; email: string; emailNormalized: string | null };

describe('backfill-email-normalized — plan (DB yok)', () => {
  it('boş / eski kuralla yazılmış değerler güncellenir; doğru olanlar değişmez', () => {
    const rows: Row[] = [
      { id: '1', email: 'ali+1@outlook.com', emailNormalized: 'ali+1@outlook.com' }, // eski kural
      { id: '2', email: 'ali.veli@gmail.com', emailNormalized: null }, // 2026-10-04 öncesi
      { id: '3', email: 'veli@icloud.com', emailNormalized: 'veli@icloud.com' }, // zaten doğru
    ];
    const plan = planBackfill(rows);
    expect(plan.unchanged).toBe(1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.updates).toEqual([
      { id: '1', email: 'ali+1@outlook.com', from: 'ali+1@outlook.com', to: 'ali@outlook.com' },
      { id: '2', email: 'ali.veli@gmail.com', from: null, to: 'aliveli@gmail.com' },
    ]);
  });

  it('aynı posta kutusunda birden çok hesap → çakışma grubu; gruptaki hiçbir satır yazılmaz', () => {
    const rows: Row[] = [
      { id: 'a', email: 'ali@outlook.com', emailNormalized: 'ali@outlook.com' },
      { id: 'b', email: 'ali+2@outlook.com', emailNormalized: 'ali+2@outlook.com' },
      { id: 'c', email: 'a.li@googlemail.com', emailNormalized: null },
      { id: 'd', email: 'ali@gmail.com', emailNormalized: 'ali@gmail.com' },
      { id: 'e', email: 'tek@hotmail.com', emailNormalized: null },
    ];
    const plan = planBackfill(rows);
    expect(plan.conflicts.map((c: { target: string; rows: Row[] }) => [c.target, c.rows.map((r) => r.id)])).toEqual([
      ['ali@outlook.com', ['a', 'b']],
      ['ali@gmail.com', ['c', 'd']],
    ]);
    expect(plan.updates.map((u: { id: string }) => u.id)).toEqual(['e']);
  });

  it('maskEmail adresi açık etmez', () => {
    expect(maskEmail('ali.veli+x@outlook.com')).toBe('a***x@o***.com');
    expect(maskEmail('ab@gmail.com')).toBe('a***@g***.com');
    expect(maskEmail('bozuk')).toBe('b***');
    expect(maskEmail('ali.veli+x@outlook.com')).not.toContain('veli');
  });
});
