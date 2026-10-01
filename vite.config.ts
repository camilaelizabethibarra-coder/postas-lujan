import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// El service worker se configura en serio en la etapa 4. Acá queda armado
// para que el manifiesto y el precacheo del shell existan desde el principio
// y no aparezcan sorpresas recién al final.
export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg'],
      manifest: {
        name: 'Postas — Peregrinación a Luján',
        short_name: 'Postas',
        description: 'Control de paso por postas. Funciona sin señal.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F7F7',
        theme_color: '#1F6BA6',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-mascara.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Nada de la API se cachea acá: los datos viven en IndexedDB y los
        // maneja la app. El service worker solo se ocupa del shell.
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
    // supabase-js entra por import() diferido y tiene que quedar en su
    // propio archivo: la app arranca contra IndexedDB sin esperarlo.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase'
        },
      },
    },
  },
})
