import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * GERÇEK veritabanına karşı entegrasyon testleri (mock'suz DB). Varsayılan `npm test` bunları ÇALIŞTIRMAZ.
 * Çalıştırma: `npm run test:db` (DB_INTEGRATION=1 gerekir — yanlışlıkla çalışmasın diye açık onay).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/db/**/*.db.test.ts'],
    setupFiles: ['src/test/db/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
