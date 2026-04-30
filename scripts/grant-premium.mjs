#!/usr/bin/env node
/**
 * Bir kullanıcıya doğrudan DB üzerinden premium tanımlar.
 * Admin session cookie gerektirmez.
 *
 * Kullanım:
 *   npm run grant-premium -- <email> <gun_sayisi>
 *   npm run grant-premium -- www@www.com 30
 *   npm run grant-premium -- www@www.com 0    # premium iptal
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Kullanim: grant-premium <email> <gun_sayisi>');
  process.exit(1);
}

const [email, daysRaw] = args;
const days = Number(daysRaw);
if (!email || !Number.isFinite(days) || days < 0) {
  console.error('Hatali parametre. Ornek: grant-premium www@www.com 30');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Kullanici bulunamadi: ${email}`);
    process.exit(2);
  }

  const premiumUntil =
    days === 0 ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { premiumUntil },
    select: { id: true, email: true, role: true, premiumUntil: true },
  });

  if (premiumUntil) {
    console.log(
      `OK  ${updated.email} icin premium aktif. Bitis: ${premiumUntil.toISOString()}`
    );
  } else {
    console.log(`OK  ${updated.email} icin premium iptal edildi.`);
  }
  console.log(updated);
}

main()
  .catch((err) => {
    console.error('Hata:', err);
    process.exit(3);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
