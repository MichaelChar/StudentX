import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Mirrors the `@/*` -> `./src/*` alias from jsconfig.json so tests can use
// the same import style as the source. Node environment by default — no
// jsdom yet (no React/component tests in v1).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        'src/messages/**',
        'src/i18n/**',
        'src/app/**/page.js',
        'src/app/**/layout.js',
        'src/components/**',
      ],
    },
  },
});
