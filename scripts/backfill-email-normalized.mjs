#!/usr/bin/env node
/**
 * `User.emailNormalized` geri doldurma: her satırı GÜNCEL `canonicalEmail` kuralıyla (src/lib/emailNormalize.ts —
 * her alan adında `+etiket`, gmail'de nokta, IDN → punycode) yeniden hesaplar.
 *
 * Varsayılan DRY-RUN: hiçbir şey yazmaz, yalnız plan ve çakışma raporu basar. `--apply` ile yazar.
 * Çakışma = aynı kanonik posta kutusunda birden çok hesap (tekil indeks yüzünden yazılamaz). Bu gruplar HİÇ
 * yazılmaz, yalnız raporlanır (kullanıcı id + maskeli e-posta) — elle karar gerekir (hesap birleştirme / bonus
 * geri alma). E-postalar çıktıda maskelenir.
 *
 * Kullanım (TypeScript modülünü içe aktardığı için tsx ile):
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-email-normalized.mjs            # dry-run
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-email-normalized.mjs --apply    # yazar
 * Ayrıntı: docs/DB_ARACLARI.md → "emailNormalized geri doldurma".
 */
import { pathToFileURL } from 'node:url';
import { canonicalEmail } from '../src/lib/emailNormalize.ts';

/** `ali.veli+x@outlook.com` → `a***i@o***.com` (yerel ilk/son harf, alanın ilk harfi + TLD). */
export function maskEmail(email) {
  if (typeof email !== 'string') return String(email);
  const at = email.lastIndexOf('@');
  if (at < 0) return `${email.slice(0, 1)}***`;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const l = local.length <= 2 ? `${local.slice(0, 1)}***` : `${local[0]}***${local[local.length - 1]}`;
  const dot = domain.lastIndexOf('.');
  const d = dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : `${domain.slice(0, 1)}***`;
  return `${l}@${d}`;
}

/**
 * Saf plan: satırlar → { updates, conflicts, unchanged }.
 * - Kanonik değeri aynı olan ≥ 2 satır → çakışma grubu (hiçbiri yazılmaz; mevcut değerleri de değişmez).
 * - Tek satırlık grupta mevcut değer farklıysa → güncelleme.
 * @param {{ id: string, email: string, emailNormalized: string | null }[]} rows
 */
export function planBackfill(rows, canonical = canonicalEmail) {
  const groups = new Map();
  for (const r of rows) {
    const target = canonical(r.email);
    const g = groups.get(target);
    if (g) g.push(r);
    else groups.set(target, [r]);
  }
  const updates = [];
  const conflicts = [];
  let unchanged = 0;
  for (const [target, g] of groups) {
    if (g.length > 1) {
      conflicts.push({ target, rows: g });
      continue;
    }
    const r = g[0];
    if (r.emailNormalized === target) unchanged++;
    else updates.push({ id: r.id, email: r.email, from: r.emailNormalized, to: target });
  }
  // Tekil indekste geçici çakışma (A'nın ESKİ değeri = B'nin yeni değeri) olabilir: `--apply` her satırı ayrı yazar,
  // P2002'yi raporlar ve atlar; betiği ikinci kez çalıştırmak (A güncellendikten sonra) B'yi de yazar.
  return { updates, conflicts, unchanged };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = [];
    let cursor;
    for (;;) {
      const page = await prisma.user.findMany({
        select: { id: true, email: true, emailNormalized: true },
        orderBy: { id: 'asc' },
        take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      rows.push(...page);
      if (page.length < 1000) break;
      cursor = page[page.length - 1].id;
    }

    const { updates, conflicts, unchanged } = planBackfill(rows);
    console.log(`Kullanıcı: ${rows.length} | değişmeyen: ${unchanged} | güncellenecek: ${updates.length} | çakışma grubu: ${conflicts.length}`);
    for (const u of updates.slice(0, 50)) {
      console.log(`  ~ ${u.id}  ${maskEmail(u.from ?? '(boş)')} → ${maskEmail(u.to)}`);
    }
    if (updates.length > 50) console.log(`  … ve ${updates.length - 50} satır daha`);
    if (conflicts.length) {
      console.log('\nÇAKIŞMA (aynı posta kutusunda birden çok hesap — YAZILMADI, elle karar gerekir):');
      for (const c of conflicts) {
        console.log(`  ${maskEmail(c.target)}:`);
        for (const r of c.rows) console.log(`    - ${r.id}  ${maskEmail(r.email)}  (mevcut emailNormalized: ${r.emailNormalized ? maskEmail(r.emailNormalized) : 'boş'})`);
      }
    }

    if (!apply) {
      console.log('\nDRY-RUN: hiçbir şey yazılmadı. Yazmak için --apply.');
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const u of updates) {
      try {
        // Yalnız okunduğu andaki değer hâlâ duruyorsa yaz (araya giren kayıt/OAuth güncellemesini ezme).
        const { count } = await prisma.user.updateMany({ where: { id: u.id, emailNormalized: u.from }, data: { emailNormalized: u.to } });
        if (count === 1) ok++;
        else {
          failed++;
          console.log(`  ! ${u.id}: satır değişmiş, atlandı`);
        }
      } catch (err) {
        failed++;
        if (err?.code === 'P2002') console.log(`  ! ${u.id}: ${maskEmail(u.to)} başka satırda (tekil çakışma), atlandı`);
        else throw err;
      }
    }
    console.log(`\nYazıldı: ${ok} | atlanan: ${failed} | çakışma grubu (yazılmadı): ${conflicts.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
