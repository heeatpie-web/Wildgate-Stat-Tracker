// ESLint flat config (ESLint v9+).
// Keep this intentionally lightweight for a desktop app repo that mixes:
// - React/TS (renderer)
// - CommonJS (Electron main/preload)
//
// The goal is: "lint runs" and catches obvious mistakes without blocking release
// due to aggressive style rules.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const baseIgnores = [
  'dist/**',
  'dist-electron/**',
  'node_modules/**',
  '**/*.min.*',
  '**/*.map',
  // Temp folders in this repo (used by release tooling / history rewrite scripts).
  '_*/**',
];

export default [
  { ignores: baseIgnores },

  // Renderer (Vite/React): TS/TSX + browser globals.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Keep lint non-blocking for release. TypeScript + tests already enforce correctness.
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // Electron main process: mostly CommonJS.
  {
    files: ['electron/**/*.cjs', 'electron/**/*.js', 'electron/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      // Avoid blocking on stylistic JS issues in the main process.
      'no-unused-vars': 'off',
    },
  },
];
