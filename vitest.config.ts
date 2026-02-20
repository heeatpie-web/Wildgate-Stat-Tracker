/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // Full-suite component imports can exceed 5s on Windows; keep tests deterministic.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: [
      'src/**/*.test.{ts,tsx}',
      'electron/**/*.test.{ts,tsx,js,cjs,mjs}',
      'scripts/**/*.test.{ts,tsx,js,cjs,mjs}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
