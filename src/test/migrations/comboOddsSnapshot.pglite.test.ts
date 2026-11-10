import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/server/combo/candidates', () => ({ loadComboCandidates: vi.fn() }));

import { saveSnapshots, runComboOddsSnapshot, type Exec, type SnapshotRow } from '@/server/combo/oddsSnapshot';

/**
 * Bekleyen migration (docs/migrations-pending/…combo_odds_snapshot) + upsert SQL'i GERÇEK Postgres motorunda (PGlite, bellek içi —
 * hiçbir DB'ye bağlanmaz). İdempotent upsert (ilk oran sabit, son oran güncellenir), başladıktan sonra donma, CHECK, RLS.
 */
const SQL = readFileSync(path.join(process.cwd(), 'docs', 'migrations-pending', '20261111120000_combo_odds_snapshot', 'migration.sql'), 'utf8');
let db: PGlite;
const exec: Exec = async (text, values) => void (await db.query(text, values as unknown[]));

const future = () => new Date(Date.now() + 6 * 3600_000);
const row = (over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  matchId: '19172147', pickKey: 'over15', afFixtureId: 1584458, day: '2026-11-12', kickoffAt: future(), pct: 84, bookmaker: 'Bet365', odd: 1.1, median: 1.12, ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
  await db.exec(SQL);
});
beforeEach(async () => void (await db.exec(`DELETE FROM "ComboOddsSnapshot"`)));

const all = async () => (await db.query<Record<string, unknown>>(`SELECT * FROM "ComboOddsSnapshot" ORDER BY "pickKey"`)).rows;

describe('ComboOddsSnapshot (migration + upsert)', () => {
  it('migration iki kez çalışır (IF NOT EXISTS); RLS açık, anon / authenticated yetkisiz', async () => {
    await db.exec(SQL);
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'ComboOddsSnapshot'`)).rows[0]).toEqual({ relrowsecurity: true });
    for (const role of ['anon', 'authenticated']) {
      expect((await db.query(`SELECT has_table_privilege('${role}', '"ComboOddsSnapshot"', 'SELECT') AS ok`)).rows[0]).toEqual({ ok: false });
    }
  });

  it('idempotent: ikinci çalıştırma satır eklemez; ilk oran sabit, son oran + sayaç güncellenir', async () => {
    await saveSnapshots(exec, [row()]);
    await saveSnapshots(exec, [row({ odd: 1.07, median: 1.09 })]);
    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstOdd: 1.1, lastOdd: 1.07, firstMedian: 1.12, lastMedian: 1.09, snapshots: 2 });
  });

  it('maç başladıktan sonra güncellenmez (oran donar); farklı pazar ayrı satır', async () => {
    await db.query(
      `INSERT INTO "ComboOddsSnapshot" (id,"matchId","pickKey","afFixtureId",day,"kickoffAt",pct,bookmaker,"firstOdd","firstMedian","lastOdd","lastMedian") VALUES ('x','m1','home',1,'d',now() - interval '1 hour',60,'Bet365',2,2,2,2)`,
    );
    await saveSnapshots(exec, [row({ matchId: 'm1', pickKey: 'home', odd: 1.5 }), row({ matchId: 'm1', pickKey: 'draw', odd: 3 })]);
    const rows = await all();
    expect(rows.find((r) => r.pickKey === 'home')).toMatchObject({ lastOdd: 2, snapshots: 1 });
    expect(rows).toHaveLength(2);
  });

  it('oran ≤ 1 CHECK ile reddedilir', async () => {
    await expect(saveSnapshots(exec, [row({ odd: 1 })])).rejects.toThrow();
  });

  it('olasılıksız (milli) satırda pct null; sonraki çalıştırma var olan pct\'yi silmez', async () => {
    await saveSnapshots(exec, [row({ pct: null })]);
    expect((await all())[0]!.pct).toBeNull();
    await saveSnapshots(exec, [row({ pct: 70 })]);
    await saveSnapshots(exec, [row({ pct: null })]);
    expect((await all())[0]!.pct).toBe(70);
  });
});

describe('tablo yok → sessizce atla', () => {
  it('saveSnapshots 42P01 hatasını yutar ve skipped döner', async () => {
    const missing: Exec = async () => {
      throw Object.assign(new Error('relation "ComboOddsSnapshot" does not exist'), { code: '42P01' });
    };
    expect(await saveSnapshots(missing, [row(), row({ pickKey: 'btts' })])).toEqual({ written: 0, skipped: 'no-table' });
  });

  it('başka hata fırlatılır', async () => {
    await expect(saveSnapshots(async () => { throw new Error('boom'); }, [row()])).rejects.toThrow('boom');
  });
});

describe('runComboOddsSnapshot', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  const cand = { matchId: '5', label: 'A – B', homeName: 'A', awayName: 'B', competition: 'L', kickoffIso: '2026-11-12T18:00:00.000Z', key: 'over25' as const, pct: 72 };

  it('adayların oranını tek seferde alır; yalnız eşleşip oranı olanları yazar', async () => {
    const written: unknown[][] = [];
    const out = await runComboOddsSnapshot({
      now,
      exec: async (_t, v) => void written.push(v),
      candidates: vi.fn(async (d: string) => (d === '2026-11-12' ? [cand, { ...cand, matchId: '6' }] : [])) as never,
      odds: vi.fn(async () => [
        { matchId: '5', status: 'ok', afFixtureId: 77, market: { odd: 1.9, bookmaker: 'Bet365', median: 1.88, bookmakers: 5 }, updatedAt: null, matchQuality: 'both-teams' },
        { matchId: '6', status: 'no-odds', afFixtureId: 78 },
      ]) as never,
      nationalEnabled: false,
    });
    expect(out).toMatchObject({ candidates: 2, withOdds: 1, national: 0, written: 1 });
    expect(written).toHaveLength(1);
    expect(written[0]!.slice(1, 4)).toEqual(['5', 'over25', 77]);
  });

  it('milli bayrağı kapalıyken milli maça hiç gidilmez', async () => {
    const nationalDay = vi.fn();
    await runComboOddsSnapshot({ now, exec: async () => undefined, candidates: (async () => []) as never, nationalDay: nationalDay as never, nationalEnabled: false });
    expect(nationalDay).not.toHaveBeenCalled();
  });

  it('milli maç (bayrak açık): olasılıksız 1X2/2.5/KG satırları', async () => {
    const written: unknown[][] = [];
    const natOdds = {
      fixture: { id: 1 },
      bookmakers: [{ id: 11, name: '1xBet', bets: [{ id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '1.9' }, { value: 'Draw', odd: '3.4' }, { value: 'Away', odd: '4.2' }] }] }],
    };
    const out = await runComboOddsSnapshot({
      now,
      exec: async (_t, v) => void written.push(v),
      candidates: (async () => []) as never,
      nationalEnabled: true,
      nationalDay: (async (d: string) => ({ ok: true, matches: d === '2026-11-12' ? [{ id: 2001528905, date: '2026-11-12', scheduled: '17:45', status: 'NS' }] : [] })) as never,
      afOdds: (async () => ({ ok: true, entry: natOdds })) as never,
    });
    expect(out).toMatchObject({ national: 1, written: 3 });
    expect(written.every((v) => v[6] === null)).toBe(true);
  });
});
