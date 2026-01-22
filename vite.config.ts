import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // CRITICAL: Ensures assets load correctly in Electron (file:// protocol)
  server: {
    open: false, // Electron handles opening the window now
    host: true,
  },
  optimizeDeps: {
    include: ['react-grid-layout', 'react-resizable'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Wildgate Stat Tracker',
        short_name: 'Wildgate',
        description: 'Track your Artifact Brawl and Fleet Battle stats.',
        theme_color: '#0b0d14',
        background_color: '#0b0d14',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/2933/2933245.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});