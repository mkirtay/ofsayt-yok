#!/usr/bin/env node
/**
 * Kupon kodu oluşturur / günceller (DB'ye doğrudan; admin oturumu gerekmez).
 *
 * Kullanım:
 *   npm run create-coupon -- <KOD> <kredi> [--max=<toplam kullanım>] [--expires=<YYYY-MM-DD>] [--note="..."]
 *   npm run create-coupon -- FUTBOL10 10
 *   npm run create-coupon -- KUBILAY10 10 --max=500 --expires=2026-12-31
 *   npm run create-coupon -- FUTBOL10 --off      (kuponu kapatır)
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const code = (pos[0] ?? '').trim().toUpperCase();
if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
  console.error('Kullanim: create-coupon <KOD> <kredi> [--max=N] [--expires=YYYY-MM-DD] [--note=...] | <KOD> --off');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  if (flags.off) {
    const { count } = await prisma.coupon.updateMany({ where: { code }, data: { active: false } });
    console.log(count ? `OK  ${code} kapatildi` : `Kupon yok: ${code}`);
    return;
  }
  const credits = Number(pos[1]);
  if (!Number.isInteger(credits) || credits <= 0) {
    console.error('kredi pozitif tam sayi olmali.');
    process.exit(1);
  }
  const maxRedemptions = flags.max === undefined ? null : Number(flags.max);
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0)) {
    console.error('--max pozitif tam sayi olmali.');
    process.exit(1);
  }
  // Bitiş günün sonu (Europe/Istanbul, UTC+3).
  const expiresAt = flags.expires ? new Date(`${flags.expires}T23:59:59+03:00`) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    console.error('--expires YYYY-MM-DD olmali.');
    process.exit(1);
  }
  const note = typeof flags.note === 'string' ? flags.note : null;
  const row = await prisma.coupon.upsert({
    where: { code },
    create: { code, credits, maxRedemptions, expiresAt, note },
    update: { credits, maxRedemptions, expiresAt, note, active: true },
  });
  console.log(`OK  ${row.code}: +${row.credits} kredi, kullanim ${row.redeemedCount}/${row.maxRedemptions ?? '∞'}, bitis ${row.expiresAt?.toISOString() ?? 'yok'}`);
}

main()
  .catch((err) => { console.error('Hata:', err); process.exit(3); })
  .finally(() => prisma.$disconnect());
