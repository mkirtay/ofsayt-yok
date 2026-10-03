/**
 * Kredi testleri için bellek içi sahte Prisma (gerçek veritabanına bağlanmaz).
 *
 * Postgres'in bu testlerde önemli davranışlarını taklit eder:
 * - Satır kilidi: bir işlemde yazılan satır işlem bitene kadar kilitli; başka işlemin yazması bekler
 *   (READ COMMITTED + `UPDATE` kilidi). Koşullu güncelleme (`credits >= n`) kilit alındıktan sonra değerlendirilir.
 * - İşlem geri alma: `$transaction` içinde hata → o işlemin tüm yazıları geri alınır.
 * - Tekil kısıtlar: (`userId`, `idempotencyKey`), `refundOfId`, (`matchId`, `matchStatus`) → P2002.
 * - `CHECK (credits >= 0)`.
 * Her işlem adımı olay döngüsüne bir tur verir → eşzamanlı istekler gerçekten iç içe geçer.
 */
import { Prisma } from '@prisma/client';

export type FakeUser = {
  id: string;
  role: string;
  credits: number;
  updatedAt: Date;
  emailVerified: Date | null;
  createdAt: Date;
  premiumUntil: Date | null;
};
export type FakeUnlock = {
  id: string;
  userId: string;
  matchAnalysisId: string;
  matchId: string;
  source: string;
  creditTransactionId: string | null;
  createdAt: Date;
};
export type FakeCreditTx = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  matchId: string | null;
  note: string | null;
  idempotencyKey: string | null;
  status: string | null;
  refundOfId: string | null;
  createdAt: Date;
};
export type FakeAnalysis = { id: string; matchId: string; matchStatus: string; [k: string]: unknown };

type Where = Record<string, unknown>;

function uniqueError(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (${target.join(',')})`, {
    code: 'P2002',
    clientVersion: 'fake',
    meta: { target },
  });
}

function notFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'fake' });
}

/** Basit Prisma `where` eşleştirici: eşitlik, null, `in`, `not`, `lt`, `gte`, `OR`. */
function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Where[]).some((w) => matches(row, w))) return false;
      continue;
    }
    const v = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; not?: unknown; lt?: Date | number; gte?: number };
      if ('in' in c && !c.in!.includes(v)) return false;
      // SQL: `x <> 'A'` NULL için doğru değil (UNKNOWN) — Prisma `not` da NULL satırı dışarıda bırakır.
      if ('not' in c && (v === null || v === undefined || v === c.not)) return false;
      if ('lt' in c && !((v as number | Date) < c.lt!)) return false;
      if ('gte' in c && !((v as number) >= c.gte!)) return false;
      continue;
    }
    if (cond === null ? v !== null && v !== undefined : v !== cond) return false;
  }
  return true;
}

const tick = () => new Promise<void>((r) => setImmediate(r));

export function createFakeCreditDb(opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  const users = new Map<string, FakeUser>();
  const ledger: FakeCreditTx[] = [];
  const analyses: FakeAnalysis[] = [];
  const unlocks: FakeUnlock[] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}${++seq}`;

  type Ctx = { id: symbol; undo: Array<() => void>; held: Set<string> };
  const locks = new Map<string, { owner: symbol; released: Promise<void>; release: () => void }>();

  async function lock(ctx: Ctx, key: string) {
    for (;;) {
      const l = locks.get(key);
      if (!l || l.owner === ctx.id) break;
      await l.released;
    }
    if (!locks.has(key)) {
      let release!: () => void;
      const released = new Promise<void>((r) => (release = r));
      locks.set(key, { owner: ctx.id, released, release });
      ctx.held.add(key);
    }
  }

  function finish(ctx: Ctx, ok: boolean) {
    if (!ok) for (const u of ctx.undo.reverse()) u();
    for (const key of ctx.held) {
      const l = locks.get(key)!;
      locks.delete(key);
      l.release();
    }
  }

  function applyCredits(ctx: Ctx, user: FakeUser, delta: number) {
    if (user.credits + delta < 0) {
      throw new Error('new row for relation "User" violates check constraint "User_credits_nonnegative"');
    }
    const before = user.credits;
    user.credits += delta;
    ctx.undo.push(() => (user.credits = before));
  }

  type CreditsData = { credits?: number | { increment?: number; decrement?: number } };

  /** Atomik artırma/azaltma ya da mutlak yazım (`credits: 5` — eski "oku → yaz" deseni). */
  function creditDelta(user: FakeUser, data: CreditsData): number {
    if (typeof data.credits === 'number') return data.credits - user.credits;
    return (data.credits?.increment ?? 0) - (data.credits?.decrement ?? 0);
  }

  function client(ctx: Ctx) {
    return {
      user: {
        async findUnique({ where }: { where: { id: string } }) {
          await tick();
          const u = users.get(where.id);
          return u ? { ...u } : null;
        },
        async updateMany({ where, data }: { where: Where & { id: string }; data: CreditsData }) {
          await tick();
          await lock(ctx, `User:${where.id}`);
          const u = users.get(where.id);
          if (!u || !matches(u as unknown as Record<string, unknown>, where)) return { count: 0 };
          applyCredits(ctx, u, creditDelta(u, data));
          return { count: 1 };
        },
        async update({ where, data }: { where: { id: string }; data: CreditsData & Partial<Omit<FakeUser, 'credits'>> }) {
          await tick();
          await lock(ctx, `User:${where.id}`);
          const u = users.get(where.id);
          if (!u) throw notFoundError();
          if (data.credits !== undefined) applyCredits(ctx, u, creditDelta(u, data));
          const { credits: _c, ...rest } = data;
          void _c;
          if (Object.keys(rest).length) {
            const before = { ...u };
            Object.assign(u, rest);
            ctx.undo.push(() => Object.assign(u, before));
          }
          return { ...u };
        },
      },
      creditTransaction: {
        async create({ data }: { data: Partial<FakeCreditTx> & Pick<FakeCreditTx, 'userId' | 'type' | 'amount' | 'balanceAfter'> }) {
          await tick();
          const row: FakeCreditTx = {
            id: nextId('ct'),
            matchId: null,
            note: null,
            idempotencyKey: null,
            status: null,
            refundOfId: null,
            createdAt: new Date(now()),
            ...data,
          };
          if (row.idempotencyKey && ledger.some((t) => t.userId === row.userId && t.idempotencyKey === row.idempotencyKey)) {
            throw uniqueError(['userId', 'idempotencyKey']);
          }
          if (row.refundOfId && ledger.some((t) => t.refundOfId === row.refundOfId)) throw uniqueError(['refundOfId']);
          ledger.push(row);
          await lock(ctx, `CT:${row.id}`);
          ctx.undo.push(() => ledger.splice(ledger.indexOf(row), 1));
          return { ...row };
        },
        async findUnique({ where }: { where: { id?: string; userId_idempotencyKey?: { userId: string; idempotencyKey: string } } }) {
          await tick();
          const k = where.userId_idempotencyKey;
          const row = k
            ? ledger.find((t) => t.userId === k.userId && t.idempotencyKey === k.idempotencyKey)
            : ledger.find((t) => t.id === where.id);
          return row ? { ...row } : null;
        },
        async findMany({ where, take }: { where?: Where; take?: number }) {
          await tick();
          const rows = ledger.filter((t) => matches(t as unknown as Record<string, unknown>, where)).map((t) => ({ ...t }));
          return take ? rows.slice(0, take) : rows;
        },
        async updateMany({ where, data }: { where: Where & { id: string }; data: Partial<FakeCreditTx> }) {
          await tick();
          await lock(ctx, `CT:${where.id}`);
          const row = ledger.find((t) => t.id === where.id);
          if (!row || !matches(row as unknown as Record<string, unknown>, where)) return { count: 0 };
          const before = { ...row };
          Object.assign(row, data);
          ctx.undo.push(() => Object.assign(row, before));
          return { count: 1 };
        },
      },
      matchAnalysis: {
        async findUnique({ where }: { where: { id?: string; matchId_matchStatus?: { matchId: string; matchStatus: string } } }) {
          await tick();
          const k = where.matchId_matchStatus;
          if (!k) return analyses.find((a) => a.id === where.id) ?? null;
          return analyses.find((a) => a.matchId === k.matchId && a.matchStatus === k.matchStatus) ?? null;
        },
        async findMany({ where }: { where?: Where }) {
          await tick();
          return analyses.filter((a) => matches(a, where)).map((a) => ({ ...a, predictionRecord: null }));
        },
        async create({ data }: { data: Omit<FakeAnalysis, 'id'> }) {
          await tick();
          if (analyses.some((a) => a.matchId === data.matchId && a.matchStatus === data.matchStatus)) {
            throw uniqueError(['matchId', 'matchStatus']);
          }
          const row = { id: nextId('ma'), ...data } as FakeAnalysis;
          analyses.push(row);
          ctx.undo.push(() => analyses.splice(analyses.indexOf(row), 1));
          return { ...row };
        },
      },
      analysisUnlock: {
        async findUnique({ where }: { where: { id?: string; userId_matchAnalysisId?: { userId: string; matchAnalysisId: string } } }) {
          await tick();
          const k = where.userId_matchAnalysisId;
          const row = k
            ? unlocks.find((u) => u.userId === k.userId && u.matchAnalysisId === k.matchAnalysisId)
            : unlocks.find((u) => u.id === where.id);
          return row ? { ...row } : null;
        },
        async findMany({ where, take }: { where?: Where; take?: number }) {
          await tick();
          const rows = unlocks.filter((u) => matches(u as unknown as Record<string, unknown>, where)).map((u) => ({ ...u }));
          return take ? rows.slice(0, take) : rows;
        },
        async count({ where }: { where?: Where } = {}) {
          await tick();
          return unlocks.filter((u) => matches(u as unknown as Record<string, unknown>, where)).length;
        },
        async create({ data }: { data: Omit<FakeUnlock, 'id' | 'createdAt' | 'creditTransactionId'> & { creditTransactionId?: string | null } }) {
          await tick();
          if (unlocks.some((u) => u.userId === data.userId && u.matchAnalysisId === data.matchAnalysisId)) {
            throw uniqueError(['userId', 'matchAnalysisId']);
          }
          if (data.creditTransactionId && unlocks.some((u) => u.creditTransactionId === data.creditTransactionId)) {
            throw uniqueError(['creditTransactionId']);
          }
          const row: FakeUnlock = { id: nextId('ul'), createdAt: new Date(now()), creditTransactionId: null, ...data };
          unlocks.push(row);
          ctx.undo.push(() => unlocks.splice(unlocks.indexOf(row), 1));
          return { ...row };
        },
      },
      predictionRecord: {
        async findUnique() {
          return null;
        },
      },
    };
  }

  /** İşlem dışı her çağrı tek ifadelik otomatik işlem. */
  function autocommit<T extends object>(make: (c: ReturnType<typeof client>) => T): T {
    return new Proxy({} as T, {
      get(_t, model: string) {
        return new Proxy(
          {},
          {
            get(_m, op: string) {
              return async (args: unknown) => {
                const ctx: Ctx = { id: Symbol('auto'), undo: [], held: new Set() };
                try {
                  const r = await (make(client(ctx)) as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[model]![op]!(args);
                  finish(ctx, true);
                  return r;
                } catch (e) {
                  finish(ctx, false);
                  throw e;
                }
              };
            },
          },
        );
      },
    });
  }

  const auto = autocommit((c) => c);
  const prisma = {
    user: auto.user,
    creditTransaction: auto.creditTransaction,
    matchAnalysis: auto.matchAnalysis,
    analysisUnlock: auto.analysisUnlock,
    predictionRecord: auto.predictionRecord,
    async $transaction<T>(fn: (tx: ReturnType<typeof client>) => Promise<T>): Promise<T> {
      const ctx: Ctx = { id: Symbol('tx'), undo: [], held: new Set() };
      try {
        const r = await fn(client(ctx));
        finish(ctx, true);
        return r;
      } catch (e) {
        finish(ctx, false);
        throw e;
      }
    },
  };

  return {
    prisma,
    users,
    ledger,
    analyses,
    unlocks,
    addUser(
      id: string,
      credits: number,
      role = 'USER',
      opts: Partial<Pick<FakeUser, 'emailVerified' | 'createdAt' | 'premiumUntil'>> = {},
    ) {
      const t = new Date(now());
      users.set(id, { id, role, credits, updatedAt: t, emailVerified: null, createdAt: t, premiumUntil: null, ...opts });
    },
    addAnalysis(matchId: string, extra: Record<string, unknown> = {}) {
      const row = { id: nextId('ma'), matchId, matchStatus: 'PRE', ...extra } as FakeAnalysis;
      analyses.push(row);
      return row;
    },
    balance(id: string) {
      return users.get(id)!.credits;
    },
    ledgerOf(userId: string) {
      return ledger.filter((t) => t.userId === userId);
    },
    /** Defter toplamı (başlangıç bakiyesi hariç). */
    ledgerSum(userId: string) {
      return ledger.filter((t) => t.userId === userId).reduce((s, t) => s + t.amount, 0);
    },
  };
}

export type FakeCreditDb = ReturnType<typeof createFakeCreditDb>;
