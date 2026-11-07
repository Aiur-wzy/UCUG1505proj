import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022', rolldownOptions: { input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
    game: fileURLToPath(new URL('./dev/game.html', import.meta.url)),
    stack: fileURLToPath(new URL('./dev/stack.html', import.meta.url)),
  } } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
