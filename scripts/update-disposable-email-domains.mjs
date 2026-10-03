#!/usr/bin/env node
/**
 * Tek kullanımlık e-posta alan adı listesini yeniler → src/config/disposableEmailDomains.generated.ts
 * Kaynak: github.com/disposable-email-domains/disposable-email-domains (CC0 1.0, kamu malı).
 * Kullanım: node scripts/update-disposable-email-domains.mjs [yerel .conf dosyası]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'config', 'disposableEmailDomains.generated.ts');

const local = process.argv[2];
const text = local ? await readFile(local, 'utf8') : await (await fetch(SRC)).text();
const domains = [...new Set(text.split('\n').map((l) => l.trim().toLowerCase()).filter((l) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(l)))].sort();
// Güvenlik: yaygın sağlayıcılar listede olmamalı.
for (const d of ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yandex.com', 'icloud.com']) {
  if (domains.includes(d)) throw new Error(`liste yaygın sağlayıcı içeriyor: ${d}`);
}
await writeFile(
  out,
  `// ÜRETİLDİ: scripts/update-disposable-email-domains.mjs — elle düzenleme. Kaynak: disposable-email-domains (CC0 1.0).\n` +
    `// ${domains.length} alan adı, ${new Date().toISOString().slice(0, 10)}.\n` +
    `export const DISPOSABLE_EMAIL_DOMAINS_TEXT = ${JSON.stringify(domains.join('\n'))};\n`,
);
console.log(`${domains.length} alan adı → ${path.relative(root, out)}`);
