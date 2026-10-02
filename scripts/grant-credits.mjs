#!/usr/bin/env node
/**
 * Bir kullanıcıya doğrudan DB üzerinden kredi tanımlar.
 * Admin session cookie gerektirmez.
 *
 * Kullanım:
 *   npm run grant-credits -- <email> <miktar>
 *   npm run grant-credits -- www@www.com 50
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Kullanim: grant-credits <email> <miktar>');
  process.exit(1);
}

const [email, amountRaw] = args;
const amount = Number(amountRaw);
if (!email || !Number.isFinite(amount)) {
  console.error('Hatali parametre. Ornek: grant-credits www@www.com 50');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Kullanici bulunamadi: ${email}`);
    process.exit(2);
  }

  // Atomik: bakiye tek UPDATE ile değişir (eşzamanlı harcamayla yarışta kayıp olmaz); düşüm eksiye indiremez.
  const balanceAfter = await prisma.$transaction(async (tx) => {
    let credits;
    if (amount >= 0) {
      ({ credits } = await tx.user.update({
        where: { id: user.id },
        data: { credits: { increment: amount } },
        select: { credits: true },
      }));
    } else {
      const { count } = await tx.user.updateMany({
        where: { id: user.id, credits: { gte: -amount } },
        data: { credits: { decrement: -amount } },
      });
      if (count === 0) throw new Error(`Yetersiz bakiye: ${email} (${user.credits} kredi), düşülmek istenen ${-amount}`);
      ({ credits } = await tx.user.findUnique({ where: { id: user.id }, select: { credits: true } }));
    }
    await tx.creditTransaction.create({
      data: {
        userId: user.id,
        type: 'ADMIN_GRANT',
        amount,
        balanceAfter: credits,
        note: 'CLI ile manuel kredi tanımlama',
      },
    });
    return credits;
  });

  console.log(`OK  ${email} icin yeni bakiye: ${balanceAfter} kredi`);
}

main()
  .catch((err) => {
    console.error('Hata:', err);
    process.exit(3);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
