import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

const base = process.env.VITE_APP_BASE || '/'

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'supabase/functions/_shared'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: null,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'Chase',
        short_name: 'Chase',
        description: 'Follow-through reminders for PEMB drafting.',
        theme_color: '#efece4',
        background_color: '#efece4',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
