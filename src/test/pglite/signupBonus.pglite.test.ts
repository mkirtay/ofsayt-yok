/**
 * Kayıt bonusu posta kutusu başına bir (GUVENLIK_RAPORU O2) — GERÇEK SQL motoru (PGlite, bellek içi; ağdaki hiçbir DB'ye
 * bağlanılmaz) üzerinde `grantVerifiedSignupBonus`: `pg_advisory_xact_lock(hashtext(...))`, `sameMailboxWhere`
 * (`startsWith`/`endsWith` + `%`/`_` kaçışı) ve tekil anahtar sahte DB'de değil Postgres'te sınanır.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let grantVerifiedSignupBonus: typeof import('@/lib/credits').grantVerifiedSignupBonus;

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  ({ grantVerifiedSignupBonus } = await import('@/lib/credits'));
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

const mkUser = (email: string, verified = true) =>
  prisma.user.create({ data: { email, emailVerified: verified ? new Date() : null, credits: 0 }, select: { id: true } });
const bonuses = (userId: string) => prisma.creditTransaction.count({ where: { userId, type: 'SIGNUP_BONUS' } });
const credits = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).credits;

describe('grantVerifiedSignupBonus (PGlite)', () => {
  it('doğrulanmış hesaba bir kez verir; ikinci çağrı no-op', async () => {
    const u = await mkUser('tek@outlook.example');
    await grantVerifiedSignupBonus(u.id);
    await grantVerifiedSignupBonus(u.id);
    expect(await bonuses(u.id)).toBe(1);
    expect(await credits(u.id)).toBeGreaterThan(0);
  });

  it('doğrulanmamış hesaba vermez', async () => {
    const u = await mkUser('dogrulanmamis@outlook.example', false);
    await grantVerifiedSignupBonus(u.id);
    expect(await bonuses(u.id)).toBe(0);
    expect(await credits(u.id)).toBe(0);
  });

  it('aynı posta kutusunun + etiketli kardeşleri (eski kuralla açılmış) ikinci bonusu alamaz', async () => {
    const a = await mkUser('ali+1@outlook.example');
    const b = await mkUser('ali+2@outlook.example');
    const c = await mkUser('ali@outlook.example');
    await grantVerifiedSignupBonus(a.id);
    await grantVerifiedSignupBonus(b.id);
    await grantVerifiedSignupBonus(c.id);
    expect((await bonuses(a.id)) + (await bonuses(b.id)) + (await bonuses(c.id))).toBe(1);
  });

  it('LIKE joker karakterleri kardeş sanılmaz (ali_x / ali%x farklı posta kutuları)', async () => {
    const a = await mkUser('ve_li@outlook.example');
    const b = await mkUser('veXli@outlook.example');
    await grantVerifiedSignupBonus(a.id);
    await grantVerifiedSignupBonus(b.id);
    expect(await bonuses(a.id)).toBe(1);
    expect(await bonuses(b.id)).toBe(1);
  });

  it('eşzamanlı çağrılar (kilit SQL ifadesi gerçek motorda çalışır) toplam tek bonus', async () => {
    const ids = await Promise.all(['zed+a', 'zed+b', 'zed+c'].map((l) => mkUser(`${l}@outlook.example`)));
    await Promise.all(ids.map((u) => grantVerifiedSignupBonus(u.id)));
    const total = (await Promise.all(ids.map((u) => bonuses(u.id)))).reduce((s, n) => s + n, 0);
    expect(total).toBe(1);
  });
});
