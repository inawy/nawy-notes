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
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png'],
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
        theme_color: '#f8fafc',
        // الضغط المطوّل على الأيقونة: إجراءات سريعة تفتح المحرر مباشرة
        shortcuts: [
          { name: 'ملاحظة جديدة', short_name: 'ملاحظة', url: './?new=text', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'قائمة جديدة', short_name: 'قائمة', url: './?new=list', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'تسجيل صوتي', short_name: 'تسجيل', url: './?new=audio', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'رسم', short_name: 'رسم', url: './?new=draw', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        // المشاركة من تطبيقات أخرى (نص/رابط) تصبح ملاحظة جديدة
        share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
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
