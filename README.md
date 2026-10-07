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

## الهيكل والتوثيق

- `AGENTS.md` — دليل العمل للزملاء والوكلاء (المكدّس، الأوامر، **القواعد الذهبية** كي لا يُكسر التطبيق).
- `docs/architecture.md` — الوحدات وتدفق البيانات والترحيل وCI.
- `docs/decisions.md` — سجلّ القرارات وأسبابها.
- `.claude/skills` و`.claude/agents` — مهارات ووكلاء جاهزون: التحقق، تغيير البيانات، اتفاقيات الواجهة، النشر وPWA، مراجع الكود، كاتب الاختبارات.

```
src/
  main.ts       الشاشة الرئيسية     db.ts          Dexie والنسخ الاحتياطي
  reader.ts     ورقة القراءة        editor/        المحرر (نص / قائمة / رسم / وسائط)
  features/     ميزات مستقلة         views/card.ts  بطاقة الملاحظة
  lib/          أدوات (html, icons, …)  data/envelope.ts  مغلف التصدير والترحيل
tests/ و e2e/   اختبارات الوحدات و Playwright
```

## الجودة

```bash
npm test && npm run lint && npm run build   # ما يشغّله CI قبل أي نشر
npx playwright test                         # اختبارات المتصفح
```

## التطوير لاحقاً

- **المزامنة**: المعرّفات UUID و`updatedAt` وشواهد الحذف موجودة أصلاً. أضف `version(n+1)` في `db.ts` ولا تعدّل القديمة.
- **الخط**: الخط الحالي خطوط النظام. لخط IBM Plex Sans Arabic يعمل أوفلاين ثبّت `@fontsource/ibm-plex-sans-arabic` واستورده في `main.ts`.
