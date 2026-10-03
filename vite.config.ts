import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' => يعمل على GitHub Pages (مسار مشروع فرعي) وعلى نطاق مخصص مثل nawy.app بدون تغيير.
export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        id: 'nawy-note', // هوية مستقلة للتطبيق حين يشاركه الموقع منتجات أخرى
        name: 'ناوي نوت',
        short_name: 'ناوي نوت',
        description: 'ملاحظات بسيطة وسريعة تعمل بدون إنترنت',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cacheId: 'nawy-note', // أسماء ذاكرة مميّزة، ولا تُحذف إلا ذاكرة هذا المنتج
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
