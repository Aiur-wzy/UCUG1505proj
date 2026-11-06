import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
