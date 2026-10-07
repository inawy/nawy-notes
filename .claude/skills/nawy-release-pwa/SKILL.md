---
name: nawy-release-pwa
description: Use when touching vite.config.ts, the manifest, icons, service worker/update flow, share target, shortcuts, brand colors, or GitHub Pages deployment of Nawy Note.
---

# PWA والنشر

- **base** `./` ثابت. لا مسارات مطلقة تبدأ بـ `/` في الكود أو الـ manifest.
- **الألوان**: `brand.json` (pageLight/pageDark/brand500) → إضافة `brandTokens()` تستبدل `{{brand.x}}` في `index.html` وCSS؛ `vite.config.ts` و`features/theme.ts` يستوردانه. لا تكرّر hex.
- **الأيقونات** في `public/`: `favicon.svg/ico/16/32`, `apple-touch-icon.png`, `icon-192/512.png`, `maskable-192/512.png`, `monochrome-512.png`. المسارات مذكورة في `vite.config.ts` و`index.html`؛ غيّرها معاً.
- **manifest**: `id: 'nawy-note'`، اختصارات `?new=text|list|audio|draw`، `share_target` (GET: title/text/url) يعالجه `features/launch.ts`. لا دعم لمشاركة الصور (يحتاج POST + SW).
- **التحديث**: `registerType: 'prompt'` — شريط «حدّث الآن». تغيير manifest/أيقونات يتطلب من المستخدم إعادة تثبيت التطبيق.
- **التخزين الدائم**: `navigator.storage.persist()` في `features/pwa.ts`.
- **النشر**: push إلى `main` → Actions: `build` (ci/lint/test/build) + `e2e` ثم `deploy` إلى Pages. راقبه حتى النجاح (skill `nawy-verify`).
- في e2e نُعطّل الـ service worker (`serviceWorkers: 'block'`)؛ لا تعتمد عليه في الاختبارات.
