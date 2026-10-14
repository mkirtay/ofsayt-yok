import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Türkçe karaktersiz yazılmış (ASCII'ye düşmüş) yaygın kelimeler — kullanıcıya görünen metinde olmamalı. */
const ASCII_TURKISH = /\b(Lutfen|lutfen|Guvenlik|guvenlik|dogrula\w*|Dogrula\w*|basarisiz|Gecersiz|gecersiz|Sifre|Sifirlama|baglantisi|Cok fazla|kayit denemesi|olmali|icermelidir|Simdi|giris yap)\b/;

describe('Türkçe karakterler', () => {
  it('tr sözlüklerinde ASCII\'ye düşmüş kelime yok', () => {
    const dir = path.join(root, 'public/locales/tr');
    for (const f of readdirSync(dir)) {
      const values: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === 'string') values.push(v);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(JSON.parse(read(`public/locales/tr/${f}`)));
      for (const v of values) expect(v, `${f}: ${v}`).not.toMatch(ASCII_TURKISH);
    }
  });

  it.each([
    'src/lib/security.ts',
    'src/lib/accounts.ts',
    'src/pages/api/auth/forgot-password.ts',
    'src/pages/api/auth/register.ts',
    'src/pages/api/auth/reset-password.ts',
  ])('%s API hata mesajları Türkçe karakterli', (file) => {
    const messages = [...read(file).matchAll(/error:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) expect(m).not.toMatch(ASCII_TURKISH);
  });
});
