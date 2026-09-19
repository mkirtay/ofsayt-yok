// DB entegrasyon testleri için ortam: `.env.local` (DATABASE_URL, AUTH_SECRET …) modül import'larından ÖNCE yüklenir.
try {
  process.loadEnvFile('.env.local');
} catch {
  /* .env.local yoksa ortam değişkenleri dışarıdan verilmiş olmalı */
}
// Yanıtlardaki mutlak URL'leri deterministik test etmek için sabit base.
process.env.AUTH_URL = 'https://itest.ofsaytyok.example';
