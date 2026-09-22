/** Test yardımcısı: `prisma.gundemBotDraft`in bellek içi sahtesi (yalnızca bot testlerinin kullandığı sorgu şekilleri). */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test sahtesi, gevşek şema

export function createFakeDb() {
  let rows: Row[] = [];
  let seq = 0;

  const matches = (r: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v.in as unknown[]).includes(r[k]);
      return r[k] === v;
    });

  const applyData = (r: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !(v instanceof Date) && 'push' in v) r[k] = [...(r[k] ?? []), v.push];
      else r[k] = v;
    }
  };

  const gundemBotDraft = {
    async findMany({ where }: { where?: Row } = {}) {
      return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
    },
    async findUnique({ where }: { where: Row }) {
      const r = rows.find((x) => matches(x, where));
      return r ? { ...r } : null;
    },
    async create({ data }: { data: Row }) {
      if (rows.some((r) => r.externalKey === data.externalKey)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      seq += 1;
      const row = { id: `d${seq}`, status: 'PENDING', postId: null, decidedById: null, decidedAt: null, createdAt: new Date(), ...data };
      rows.push(row);
      return { ...row };
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const r = rows.find((x) => matches(x, where));
      if (!r) throw new Error('not found');
      applyData(r, data);
      return { ...r };
    },
    async updateMany({ where, data }: { where: Row; data: Row }) {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => applyData(r, data));
      return { count: hit.length };
    },
  };

  return { gundemBotDraft, __rows: () => rows, __reset: () => { rows = []; seq = 0; } };
}
