#!/usr/bin/env node
/**
 * Gündem için tek "Ofsayt Yok" resmi/bot hesabını oluşturur (idempotent — varsa dokunmaz).
 * password: null → credentials girişi reddedilir. Değerler src/lib/gundem/official.ts ile aynı olmalı.
 *
 * Kullanım: npm run seed-official
 */
import { PrismaClient } from '@prisma/client';

const EMAIL = 'official@ofsaytyok.invalid';
const USERNAME = 'ofsaytyok';
const NAME = 'Ofsayt Yok';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`Zaten var: ${existing.id} (${EMAIL})`);
    return;
  }
  const clash = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (clash) {
    console.error(`Kullanıcı adı "${USERNAME}" başka bir hesapta (${clash.email}). Seed durduruldu.`);
    process.exit(2);
  }
  const user = await prisma.user.create({
    data: { email: EMAIL, username: USERNAME, name: NAME, password: null, credits: 0 },
  });
  console.log(`OK  resmi hesap oluşturuldu: ${user.id}`);
}

main()
  .catch((err) => {
    console.error('Hata:', err);
    process.exit(3);
  })
  .finally(() => prisma.$disconnect());
