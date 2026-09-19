import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Gerçek DB'ye bağlanan entegrasyon testleri ayrı komutla (`npm run test:db`).
    exclude: [...configDefaults.exclude, 'src/test/db/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
