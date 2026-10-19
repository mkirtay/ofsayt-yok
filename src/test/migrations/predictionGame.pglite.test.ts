import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyPointsSql,
  distributionRowsSql,
  ensureEntrySql,
  mySeasonTotalSql,
  predictedWeeksSql,
  seasonAboveSql,
  predictionsForScoringSql,
  recomputeEntriesSql,
  seasonRankSql,
  seasonTopSql,
  setJokerSql,
  upsertPredictionSql,
  voidPointsSql,
  weekAboveSql,
  weekRankSql,
  weekTopSql,
  type BoardRow,
  type ScoringRow,
  type SqlQuery,
} from '@/lib/game/sql';
import { buildDistribution, isRareScore, scorePrediction } from '@/lib/game/scoring';

/**
 * Tahmin oyunu migration'ı (20261019180000_prediction_game) GERÇEK Postgres motorunda (PGlite, bellek içi — üretim DB'sine
 * bağlanmaz) + canlıda kullanılan SQL'ler aynı metinle (lib/game/sql.ts): kilit (DB saati), joker kuralları, puan yazımı,
 * haftalık / sezonluk sıralama ve görünürlük.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261019180000_prediction_game', 'migration.sql'), 'utf8');
let db: PGlite;
const run = async <T>(q: SqlQuery) => (await db.query<T>(q.text, q.values)).rows;
const one = async <T>(q: SqlQuery) => (await run<T>(q))[0];

let seq = 0;
const nid = () => `id${++seq}`;
const save = (userId: string, gameMatchId: string, home: number, away: number, weekKey = '2026-W42') =>
  run<{ id: string; changed: boolean }>(upsertPredictionSql({ id: nid(), userId, gameMatchId, weekKey, home, away }));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY, username TEXT, "emailVerified" TIMESTAMP(3));
    INSERT INTO "User" (id, username, "emailVerified") VALUES
      ('u1', 'eren', now()), ('u2', 'zeynep', now()), ('u3', NULL, now()), ('u4', 'dogrulanmamis', NULL), ('u5', 'gizli', now());
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await db.exec(SQL);
  await db.exec(`
    INSERT INTO "GameWeek" (id, "weekKey", season, status, "startsAt", "endsAt") VALUES
      ('w42', '2026-W42', '2026-27', 'PUBLISHED', '2026-10-11T21:00:00Z', '2026-10-18T21:00:00Z'),
      ('w41', '2026-W41', '2026-27', 'SETTLED', '2026-10-04T21:00:00Z', '2026-10-11T21:00:00Z'),
      ('wd', '2026-W43', '2026-27', 'DRAFT', '2026-10-18T21:00:00Z', '2026-10-25T21:00:00Z');
    INSERT INTO "GameMatch" (id, "weekId", "fixtureId", position, "kickoffAt") VALUES
      ('mOpen', 'w42', '1001', 1, now() + interval '2 hours'),
      ('mOpen2', 'w42', '1002', 2, now() + interval '3 hours'),
      ('mStarted', 'w42', '1003', 3, now() - interval '1 second'),
      ('mVoid', 'w42', '1004', 4, now() + interval '5 hours'),
      ('mDraft', 'wd', '1005', 1, now() + interval '5 days'),
      ('m41', 'w41', '1006', 1, now() - interval '7 days');
    UPDATE "GameMatch" SET status = 'VOID' WHERE id = 'mVoid';
  `);
});

describe('prediction_game migration (gerçek SQL)', () => {
  it('RLS açık, anon / authenticated tablo yetkisi yok', async () => {
    for (const t of ['GameWeek', 'GameMatch', 'GamePrediction', 'GameWeekEntry']) {
      expect((await db.query<{ r: boolean }>(`SELECT relrowsecurity AS r FROM pg_class WHERE relname = '${t}'`)).rows[0]).toEqual({ r: true });
      for (const role of ['anon', 'authenticated']) {
        const r = (await db.query<{ ok: boolean }>(`SELECT has_table_privilege('${role}', '"${t}"', 'SELECT') AS ok`)).rows[0]!;
        expect(r.ok, `${t} ${role}`).toBe(false);
      }
    }
  });

  it('kilit: başlamamış maça yazılır; başlamış / iptal / taslak hafta / başka hafta reddedilir', async () => {
    expect(await save('u1', 'mOpen', 2, 1)).toEqual([{ id: expect.any(String), changed: true }]);
    expect(await save('u1', 'mStarted', 1, 0)).toEqual([]);
    expect(await save('u1', 'mVoid', 1, 0)).toEqual([]);
    expect(await save('u1', 'mDraft', 1, 0, '2026-W43')).toEqual([]);
    expect(await save('u1', 'mOpen', 1, 0, '2026-W41')).toEqual([]); // maç bu haftanın değil
  });

  it('güncelleme: aynı skor değişiklik sayılmaz, farklı skor revizyon artırır; kullanıcı × maç tek kayıt', async () => {
    expect((await save('u1', 'mOpen', 2, 1))[0]!.changed).toBe(false);
    expect((await save('u1', 'mOpen', 3, 1))[0]!.changed).toBe(true);
    const rows = (await db.query<{ n: number; home: number; revisions: number }>(`SELECT count(*) OVER ()::int AS n, home, revisions FROM "GamePrediction" WHERE "userId" = 'u1' AND "gameMatchId" = 'mOpen'`)).rows;
    expect(rows).toEqual([{ n: 1, home: 3, revisions: 1 }]);
  });

  it('başlama saati geçince eski kayıt da değiştirilemez', async () => {
    await save('u2', 'mOpen2', 1, 1);
    await db.exec(`UPDATE "GameMatch" SET "kickoffAt" = now() - interval '1 second' WHERE id = 'mOpen2'`);
    expect(await save('u2', 'mOpen2', 2, 2)).toEqual([]);
    expect((await db.query<{ home: number }>(`SELECT home FROM "GamePrediction" WHERE "userId" = 'u2' AND "gameMatchId" = 'mOpen2'`)).rows).toEqual([{ home: 1 }]);
    await db.exec(`UPDATE "GameMatch" SET "kickoffAt" = now() + interval '3 hours' WHERE id = 'mOpen2'`);
  });

  it('joker: yalnız başlamamış maça; başlamış ya da iptal maçtaki joker taşınamaz', async () => {
    await run(ensureEntrySql({ id: nid(), userId: 'u1', weekKey: '2026-W42' }));
    await run(ensureEntrySql({ id: nid(), userId: 'u1', weekKey: '2026-W42' })); // ikinci çağrı etkisiz
    expect(await run(ensureEntrySql({ id: nid(), userId: 'u1', weekKey: '2026-W43' }))).toEqual([]); // taslak hafta
    expect(await run(setJokerSql('u1', '2026-W42', 'mStarted'))).toEqual([]);
    expect(await run(setJokerSql('u1', '2026-W42', 'mVoid'))).toEqual([]);
    expect(await run(setJokerSql('u1', '2026-W42', 'mDraft'))).toEqual([]); // başka hafta
    expect(await run(setJokerSql('u1', '2026-W42', 'mOpen'))).toHaveLength(1);
    expect(await run(setJokerSql('u1', '2026-W42', 'mOpen2'))).toHaveLength(1); // ikisi de başlamamış → taşınır
    expect(await run(setJokerSql('u1', '2026-W42', 'mOpen'))).toHaveLength(1);
    await db.exec(`UPDATE "GameMatch" SET "kickoffAt" = now() - interval '1 second' WHERE id = 'mOpen'`);
    expect(await run(setJokerSql('u1', '2026-W42', 'mOpen2'))).toEqual([]); // joker maçı başladı
    expect(await run(setJokerSql('u1', '2026-W42', null))).toEqual([]);
    const e = (await db.query<{ j: string }>(`SELECT "jokerGameMatchId" AS j FROM "GameWeekEntry" WHERE "userId" = 'u1'`)).rows;
    expect(e).toEqual([{ j: 'mOpen' }]);
  });

  it('puanlama turu: dağılım yalnız doğrulanmış hesaplar; joker ×2; toplamlar yeniden hesaplanır (idempotent)', async () => {
    // mOpen başladı (önceki test). Diğer kullanıcıların tahminleri başlamadan önce yazılmış olsun:
    await db.exec(`UPDATE "GameMatch" SET "kickoffAt" = now() + interval '1 hour' WHERE id = 'mOpen'`);
    for (const [u, h, a] of [['u2', 3, 1], ['u3', 0, 0], ['u4', 3, 1], ['u5', 1, 2]] as const) {
      await run(ensureEntrySql({ id: nid(), userId: u, weekKey: '2026-W42' }));
      await save(u, 'mOpen', h, a);
    }
    await db.exec(`UPDATE "GameMatch" SET "kickoffAt" = now() - interval '2 hours' WHERE id = 'mOpen'`);

    const dist = await run<{ home: number; away: number; n: number }>(distributionRowsSql('mOpen'));
    const counted = dist.flatMap((r) => Array.from({ length: r.n }, () => ({ home: r.home, away: r.away })));
    expect(counted).toHaveLength(4); // u4 doğrulanmamış → sayılmaz
    const d = buildDistribution(counted);
    const actual = { home: 3, away: 1 };
    const rows = await run<ScoringRow>(predictionsForScoringSql('mOpen'));
    const scored = rows.map((r) => ({ id: r.id, ...scorePrediction(r, actual, { rare: isRareScore(actual, d), joker: r.joker }) }));
    const q = applyPointsSql(scored.map((s) => s.id), scored.map((s) => s.points), scored.map((s) => JSON.stringify(s.breakdown)));
    await run(q);
    await run(q); // tekrar: aynı sonuç
    await run(recomputeEntriesSql('w42'));
    await run(recomputeEntriesSql('w42'));

    const pts = Object.fromEntries((await db.query<{ u: string; p: number }>(`SELECT "userId" AS u, points AS p FROM "GamePrediction" WHERE "gameMatchId" = 'mOpen'`)).rows.map((r) => [r.u, r.p]));
    expect(pts).toEqual({ u1: 16, u2: 8, u3: 0, u4: 8, u5: 0 }); // u1 3-1 tam skor + joker; u3 0-0 → hiç; u5 1-2 ters yön, toplam 3 ≠ 4
    const totals = (await db.query<{ u: string; t: number; ex: number; dir: number }>(`SELECT "userId" AS u, "totalPoints" AS t, "exactCount" AS ex, "directionCount" AS dir FROM "GameWeekEntry" WHERE "weekId" = 'w42' ORDER BY u`)).rows;
    expect(totals).toEqual([
      { u: 'u1', t: 16, ex: 1, dir: 1 },
      { u: 'u2', t: 8, ex: 1, dir: 1 },
      { u: 'u3', t: 0, ex: 0, dir: 0 },
      { u: 'u4', t: 8, ex: 1, dir: 1 },
      { u: 'u5', t: 0, ex: 0, dir: 0 },
    ]);
  });

  it('iptal: tahminler 0 puan, toplam düşer', async () => {
    await save('u2', 'mOpen2', 2, 0); // önceki 1-1 → 2-0
    await run(applyPointsSql([(await one<{ id: string }>({ text: `SELECT id FROM "GamePrediction" WHERE "userId"='u2' AND "gameMatchId"='mOpen2'`, values: [] }))!.id], [4], ['{"dir":3,"diff":1,"total":0,"exact":0,"rare":0,"joker":false}']));
    await run(recomputeEntriesSql('w42'));
    expect((await one<{ t: number }>({ text: `SELECT "totalPoints" AS t FROM "GameWeekEntry" WHERE "userId"='u2' AND "weekId"='w42'`, values: [] }))!.t).toBe(12);
    await run(voidPointsSql('mOpen2'));
    await run(recomputeEntriesSql('w42'));
    expect((await one<{ t: number }>({ text: `SELECT "totalPoints" AS t FROM "GameWeekEntry" WHERE "userId"='u2' AND "weekId"='w42'`, values: [] }))!.t).toBe(8);
  });

  it('haftalık tablo: takma adsız / doğrulanmamış / gizli görünmez; eşitlikte tam skor, sonra erken değişiklik', async () => {
    await db.exec(`UPDATE "GameWeekEntry" SET "hiddenAt" = now() WHERE "userId" = 'u5'`);
    await db.exec(`UPDATE "GameWeekEntry" SET "lastChangeAt" = now() - interval '1 day' WHERE "userId" = 'u2'`);
    const rows = await run<BoardRow>(weekTopSql('w42'));
    expect(rows.map((r) => [r.nickname, r.points, r.exact])).toEqual([
      ['eren', 16, 1],
      ['zeynep', 8, 1],
    ]);
    expect((await one<{ n: number }>(weekRankSql('w42', 'u2')))!.n + 1).toBe(2);
    expect((await one<{ n: number }>(weekRankSql('w42', 'u1')))!.n + 1).toBe(1);
    expect(await run(weekTopSql('w42', 1))).toHaveLength(1);
    expect(await one(weekAboveSql('w42', 'u2'))).toEqual({ points: 16 }); // zeynep'in üstü eren
    expect(await run(weekAboveSql('w42', 'u1'))).toEqual([]); // lider
  });

  it('sezon tablosu: haftaların toplamı; eşitlikte ilk katılım', async () => {
    await db.exec(`
      INSERT INTO "GameWeekEntry" (id, "userId", "weekId", season, "totalPoints", "exactCount", "directionCount", "createdAt")
      VALUES ('e41a', 'u2', 'w41', '2026-27', 8, 0, 2, now() - interval '8 days');
    `);
    const rows = await run<BoardRow>(seasonTopSql('2026-27'));
    expect(rows.map((r) => [r.nickname, r.points, r.exact, r.direction])).toEqual([
      ['zeynep', 16, 1, 3], // eşit puan: ilk katılım (W41) önce
      ['eren', 16, 1, 1],
    ]);
    expect((await one<{ n: number }>(seasonRankSql('2026-27', 'u1')))!.n + 1).toBe(2);
    expect(await one(mySeasonTotalSql('2026-27', 'u4'))).toEqual({ points: 8, exact: 1, direction: 1, weeks: 1 }); // kendi puanını görür
    expect(await run(seasonTopSql('2025-26'))).toEqual([]);
    expect(await one(seasonAboveSql('2026-27', 'u1'))).toEqual({ points: 16 }); // eşit puanda önde zeynep
    expect(await run(seasonAboveSql('2026-27', 'u2'))).toEqual([]);
    expect((await run<{ weekKey: string }>(predictedWeeksSql('u2'))).length).toBeGreaterThan(0);
  });

  it('kullanıcı silinince tahmin ve özet satırları silinir', async () => {
    await db.exec(`DELETE FROM "User" WHERE id = 'u3'`);
    expect((await one<{ n: number }>({ text: `SELECT (SELECT count(*) FROM "GamePrediction" WHERE "userId"='u3') + (SELECT count(*) FROM "GameWeekEntry" WHERE "userId"='u3') AS n`, values: [] }))!.n).toBe(0);
  });
});
