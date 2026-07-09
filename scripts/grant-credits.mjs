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

  const balanceAfter = user.credits + amount;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { credits: balanceAfter } }),
    prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: 'ADMIN_GRANT',
        amount,
        balanceAfter,
        note: 'CLI ile manuel kredi tanımlama',
      },
    }),
  ]);

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
