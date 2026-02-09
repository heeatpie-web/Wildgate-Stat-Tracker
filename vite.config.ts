import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // CRITICAL: Ensures assets load correctly in Electron (file:// protocol)
  server: {
    open: false, // Electron handles opening the window now
    host: true,
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  optimizeDeps: {
    include: ['react-grid-layout', 'react-resizable'],
  },
  plugins: [
    react()
  ]
});