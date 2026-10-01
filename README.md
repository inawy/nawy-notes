# ناوي نوت 

تطبيق ملاحظات بسيط يعمل **محليًا أولاً** (IndexedDB عبر Dexie) ويُثبَّت كتطبيق PWA ويعمل بدون إنترنت.

- ملاحظات نصية، قوائم مهام، ورسم حر (بالقلم أو الإصبع) عبر `perfect-freehand`
- تثبيت، ألوان، أرشيف، مهملات (حذف تلقائي بعد 30 يوماً)
- بحث عربي يتجاهل التشكيل والهمزات
- وضع داكن، RTL، نسخ احتياطي واستيراد JSON
- حفظ تلقائي، وتحديث فوري بين التبويبات (`liveQuery`)

## التشغيل

```bash
npm install
npm run dev        # تطوير
npm run build      # فحص الأنواع + بناء إلى dist/
npm run preview    # تجربة النسخة المبنية (هنا يعمل الـ Service Worker)
```

## النشر على GitHub Pages

1. ارفع المشروع إلى مستودع على GitHub (الفرع `main`).
2. من **Settings → Pages** اختر **Source: GitHub Actions**.
3. أي `push` على `main` ينشر تلقائياً عبر `.github/workflows/deploy.yml`.

`base: './'` في `vite.config.ts` يجعل نفس البناء يعمل على `user.github.io/repo/` وعلى نطاق مخصص.

## الهيكل

```
src/
  types.ts       أنواع البيانات
  db.ts          Dexie: الجداول، الاستعلامات، النسخ الاحتياطي
  main.ts        الشاشة الرئيسية والبحث والتبويبات
  editor.ts      محرر (نص / قائمة / رسم) بحفظ تلقائي
  lib/draw.ts    لوحة الرسم الحر
```

## التطوير لاحقاً

- **المزامنة**: المعرّفات UUID و`updatedAt` موجودان أصلاً. أضف `version(2)` في `db.ts` ولا تعدّل `version(1)`.
- **الخط**: الخط الحالي خطوط النظام. لخط IBM Plex Sans Arabic يعمل أوفلاين ثبّت `@fontsource/ibm-plex-sans-arabic` واستورده في `main.ts`.
- **الصور والمرفقات**: خزّن `Blob` في جدول منفصل (Dexie يدعمها).
