/**
 * Ödeme testleri için bellek içi sahte Prisma (yalnız test; gerçek DB'ye bağlanmaz). Ödeme servisinin kullandığı
 * modeller ve sorgu biçimleri: eşitlik / `in` / `gte` filtreleri, tekil kısıtlar (P2002), `$transaction` geri alma.
 */
import { Prisma } from '@prisma/client';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const uniqueError = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : false;
  }
  return (a ?? null) === (b ?? null);
}

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; gte?: unknown };
      if (c.in) return c.in.some((x) => same(v, x));
      if (c.gte !== undefined) {
        const lhs = v instanceof Date ? v.getTime() : (v as number);
        const rhs = c.gte instanceof Date ? c.gte.getTime() : (c.gte as number);
        return lhs >= rhs;
      }
    }
    return same(v, cond);
  });
}

function applyData(row: Row, data: Row): Row {
  const next = { ...row };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in (v as Row)) next[k] = (next[k] as number) + ((v as Row).increment as number);
    else if (v && typeof v === 'object' && !(v instanceof Date) && 'decrement' in (v as Row)) next[k] = (next[k] as number) - ((v as Row).decrement as number);
    else next[k] = v;
  }
  return next;
}

let seq = 0;

function table(name: string, uniques: string[][], defaults: (data: Row) => Row) {
  let rows: Row[] = [];
  const violates = (candidate: Row, self?: Row) =>
    uniques.some((cols) => {
      const vals = cols.map((c) => candidate[c]);
      if (vals.some((v) => v == null)) return false;
      return rows.some((r) => r !== self && cols.every((c, i) => same(r[c], vals[i])));
    });
  return {
    name,
    get rows() {
      return rows;
    },
    set rows(v: Row[]) {
      rows = v;
    },
    async findUnique({ where }: { where: Where }) {
      return rows.find((r) => matches(r, where)) ?? null;
    },
    async findFirst({ where, orderBy }: { where: Where; orderBy?: Record<string, 'asc' | 'desc'> }) {
      let list = rows.filter((r) => matches(r, where));
      if (orderBy) {
        const [k, dir] = Object.entries(orderBy)[0]!;
        list = [...list].sort((a, b) => ((a[k] as Date).getTime() - (b[k] as Date).getTime()) * (dir === 'desc' ? -1 : 1));
      }
      return list[0] ?? null;
    },
    async findMany({ where = {} }: { where?: Where } = {}) {
      return rows.filter((r) => matches(r, where));
    },
    async create({ data }: { data: Row }) {
      const row = { ...defaults(data), ...data };
      if (violates(row)) throw uniqueError();
      rows.push(row);
      return row;
    },
    async update({ where, data }: { where: Where; data: Row }) {
      const i = rows.findIndex((r) => matches(r, where));
      if (i < 0) throw new Error(`${name}: kayıt yok`);
      const next = applyData(rows[i]!, data);
      if (violates(next, rows[i])) throw uniqueError();
      rows[i] = next;
      return next;
    },
    async updateMany({ where, data }: { where: Where; data: Row }) {
      let count = 0;
      rows = rows.map((r) => {
        if (!matches(r, where)) return r;
        const next = applyData(r, data);
        if (violates(next, r)) throw uniqueError();
        count++;
        return next;
      });
      return { count };
    },
  };
}

export function createFakePaymentDb() {
  const now = () => new Date();
  const db = {
    user: table('user', [['id']], () => ({ role: 'USER', credits: 0, premiumUntil: null })),
    paymentOrder: table('paymentOrder', [['merchantOrderId'], ['hikieOrderId']], () => ({
      id: `po_${++seq}`,
      status: 'PENDING',
      hikieOrderId: null,
      createdAt: now(),
      paidAt: null,
      refundedAt: null,
    })),
    creditTransaction: table('creditTransaction', [['userId', 'idempotencyKey']], () => ({ id: `ct_${++seq}`, createdAt: now(), note: null, idempotencyKey: null })),
    premiumGrant: table('premiumGrant', [], () => ({ id: `pg_${++seq}`, createdAt: now() })),
    paymentWebhookEvent: table('paymentWebhookEvent', [['id']], () => ({ receivedAt: now() })),
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const tables = [db.user, db.paymentOrder, db.creditTransaction, db.premiumGrant, db.paymentWebhookEvent];
      const snapshot = tables.map((t) => t.rows.map((r) => ({ ...r })));
      try {
        return await fn(db);
      } catch (err) {
        tables.forEach((t, i) => (t.rows = snapshot[i]!));
        throw err;
      }
    },
    reset() {
      for (const t of [db.user, db.paymentOrder, db.creditTransaction, db.premiumGrant, db.paymentWebhookEvent]) t.rows = [];
    },
  };
  return db;
}

export type FakePaymentDb = ReturnType<typeof createFakePaymentDb>;
