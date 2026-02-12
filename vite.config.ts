import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // CRITICAL: Ensures assets load correctly in Electron (file:// protocol)
  server: {
    open: false, // Electron handles opening the window now
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // Ignore reference/example folders
      ignored: ['**/node_modules/**', '**/_md3_refs/**'],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  optimizeDeps: {
    // Pre-bundle critical frontend deps to avoid discovery delays
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-grid-layout',
      'react-resizable',
      'recharts',
      'zustand',
      'lucide-react',
      'canvas-confetti',
      'html2canvas',
    ],
    // Exclude Node-only packages from pre-bundling (used only in Electron main process)
    exclude: [
      '@google-cloud/storage',
      '@google-cloud/vision',
      'sharp',
      'tesseract.js',
      'screenshot-desktop',
      'discord-rpc',
      'electron-updater',
    ],
    // Don't scan reference folders
    entries: ['index.html', 'src/**/*.{ts,tsx}'],
  },
  build: {
    // Chunk splitting for better caching and smaller initial load
    rollupOptions: {
      external: [
        'electron',
        'sharp',
        'tesseract.js',
        '@google-cloud/storage',
        '@google-cloud/vision',
        'screenshot-desktop',
        'discord-rpc',
      ],
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-charts': ['recharts'],
          'vendor-grid': ['react-grid-layout', 'react-resizable'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  plugins: [react()],
});
// Force restart: 1