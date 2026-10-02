import { describe, it, expect } from 'vitest';
import { createFakeCreditDb } from './fakeCreditDb.testutil';

/**
 * Sahte DB'nin kendisi: kredi testlerinin anlamlı olması için eski "oku → mutlak değer yaz" desenindeki kayıp
 * güncellemeyi gerçekten üretmeli, koşullu atomik düşümde ise üretmemeli.
 */
describe('fakeCreditDb', () => {
  it('eski desen (oku → mutlak değer yaz) eşzamanlı iki düşümde kayıp güncelleme üretir', async () => {
    const db = createFakeCreditDb();
    db.addUser('u1', 10);
    const legacySpend = () =>
      db.prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: 'u1' } });
        await tx.user.update({ where: { id: 'u1' }, data: { credits: u!.credits - 5 } });
      });
    await Promise.all([legacySpend(), legacySpend()]);
    expect(db.balance('u1')).toBe(5); // iki düşüm yapıldı, biri kayboldu
  });

  it('koşullu atomik düşüm: 20 eşzamanlı istek, 50 kredi → tam 10 geçer, bakiye 0', async () => {
    const db = createFakeCreditDb();
    db.addUser('u1', 50);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.prisma.user.updateMany({ where: { id: 'u1', credits: { gte: 5 } }, data: { credits: { decrement: 5 } } }),
      ),
    );
    expect(results.filter((r) => r.count === 1)).toHaveLength(10);
    expect(db.balance('u1')).toBe(0);
  });
});
