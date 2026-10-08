import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import brand from './brand.json';

/** يستبدل {{brand.x}} في index.html وملفات CSS بقيم brand.json: مصدر واحد للألوان. */
function brandTokens(): Plugin {
  const fill = (s: string) =>
    s.replace(/\{\{brand\.(\w+)\}\}/g, (_, k: string) => {
      const v = (brand as Record<string, string>)[k];
      if (!v) throw new Error(`brand.json: مفتاح غير معروف ${k}`);
      return v;
    });
  return {
    name: 'nawy-brand-tokens',
    enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler: fill },
    transform(code, id) {
      return id.split('?')[0].endsWith('.css') ? fill(code) : null;
    },
  };
}

/**
 * سياسة أمان المحتوى كوسم meta (GitHub Pages لا يتيح ترويسات). تُحسب بصمات السكربتات المضمّنة عند البناء
 * فلا تنكسر عند تعديلها، ولا تُطبَّق في التطوير (HMR يحقن سكربتات مضمّنة).
 * style-src يسمح بـ unsafe-inline لأن الواجهة تستخدم style="" ؛ السكربتات هي الخطر الحقيقي وهي مقيّدة.
 */
function cspMeta(): Plugin {
  return {
    name: 'nawy-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        // WebCrypto عام في Node ≥ 20: لا حاجة لـ @types/node
        const sha = async (text: string) =>
          btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
        const bodies = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        const hashes = await Promise.all(bodies.map(async (b) => `'sha256-${await sha(b)}'`));
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "media-src 'self' blob: data:",
          "connect-src 'self' data: blob:",
          "font-src 'self' data:",
          "manifest-src 'self'",
          "worker-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
        return html.replace(/(<meta charset="[^"]*"\s*\/?>)/i, `$1\n    ${tag}`);
      },
    },
  };
}

// base './' => يعمل على GitHub Pages (مسار مشروع فرعي) وعلى نطاق مخصص مثل nawy.app بدون تغيير.
export default defineConfig({
  base: './',
  plugins: [
    brandTokens(),
    tailwindcss(),
    cspMeta(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'icon-192.png',
      ],
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
        background_color: brand.pageLight,
        theme_color: brand.pageLight,
        // الضغط المطوّل على الأيقونة: إجراءات سريعة تفتح المحرر مباشرة
        shortcuts: [
          {
            name: 'ملاحظة جديدة',
            short_name: 'ملاحظة',
            url: './?new=text',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'قائمة جديدة',
            short_name: 'قائمة',
            url: './?new=list',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'تسجيل صوتي',
            short_name: 'تسجيل',
            url: './?new=audio',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'رسم',
            short_name: 'رسم',
            url: './?new=draw',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
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
