# AGENTS.md — دليل العمل على «ناوي نوت»

يقرأه كل وكيل (Claude Code وغيره) وكل زميل قبل أي تعديل. الهدف: **لا تكسر التطبيق**.
تفاصيل أعمق: `docs/architecture.md` (الهيكل وتدفق البيانات) و`docs/decisions.md` (لماذا قرّرنا كذا).

## ما هو المشروع
ملاحظات بسيطة على غرار Google Keep، عربية RTL، **محلية أولاً** (بلا حساب ولا خادم ولا مزامنة إجبارية)، تُثبَّت PWA وتعمل بدون إنترنت.
مباشر: https://inawy.github.io/nawy-notes/ — يُنشر تلقائياً من `main` عبر GitHub Actions.

## المكدّس (Stack)
| الطبقة | الاختيار | ملاحظة |
|---|---|---|
| اللغة | **TypeScript** صارم (`strict`, `noUnusedLocals`, `noUnusedParameters`) | لا `any` بلا سبب (ESLint يحذّر) |
| الأدوات | **Vite 6** + `vite-plugin-pwa` | `base: './'` ثابت (انظر القواعد) |
| الواجهة | **TypeScript عادي + DOM** (لا React ولا أي إطار) | إدخال إطار قرار معماري يُسجَّل في `docs/decisions.md` أولاً |
| التنسيق | **Tailwind v4** (`@theme` في `src/style.css`) + خصائص منطقية | ألوان العلامة من `brand.json` |
| التخزين | **Dexie 4** (IndexedDB) | الحقيقة الوحيدة للبيانات |
| رسم / ترتيب | `perfect-freehand` / `src/lib/reorder.ts` (سحب وإفلات مكتوب داخلياً، يعمل في RTL) | لا Sortable |
| الاختبار | `node:test` + **vitest** (وحدات) + **Playwright** (e2e) | CI يشغّلها كلها |
| الجودة | ESLint (flat config) + Prettier | فشلها يوقف النشر |

## الأوامر
```bash
npm run dev          # تطوير
npm test             # node:test + vitest (يجب أن ينجح قبل أي push)
npm run lint         # ESLint — بلا تحذيرات
npm run typecheck    # tsc --noEmit
npm run build        # فحص الأنواع + بناء dist/
npx playwright test  # e2e (يبني ويشغّل preview تلقائياً)
npm run format       # Prettier
```

## الهيكل
```
index.html            الهيكل الثابت (القائمة، القارئ، المحرر)
brand.json            مصدر ألوان العلامة الوحيد (يُحقن بإضافة Vite)
src/main.ts           الشاشة الرئيسية: العرض، الاشتراك الحي، الترتيب، ربط الأحداث
src/db.ts             Dexie: الجداول، الاستعلامات، الحالة، الشواهد، النسخ الاحتياطي
src/data/envelope.ts  منطق نقي: مغلف التصدير + normalizeNote (ترحيل الصيغ القديمة)
src/types.ts          الأنواع المشتركة
src/reader.ts         ورقة القراءة السفلية
src/editor/*          المحرر (session = الحالة، hooks تمنع الاستيراد الدائري)
src/features/*        ميزات تُركَّب بـ mountX(): backup, pwa, drawer, tab-swipe, launch, theme
src/views/card.ts     دالة نقية cardHTML(note, ctx) — لا تقرأ حالة التطبيق
src/lib/*             أدوات: html, icons, util, swipe-dismiss, focus-trap, toast, draw, media…
tests/                node:test (envelope, install) و tests/unit (vitest)
e2e/                  Playwright على النسخة المبنية بـ IndexedDB حقيقية
```

## القواعد الذهبية (كسرها = كسر التطبيق)
**البيانات**
1. لا تعدّل `version(n)` موجودة في `db.ts`؛ أضف `version(n+1)`. الترحيل يتم عند القراءة في `normalizeNote` (لا `upgrade()` ما أمكن).
2. الحذف النهائي = **شاهد حذف** (`status: 'deleted'` + `deletedAt`) وليس `delete`. لا تعرض `deleted` في أي عرض.
3. أي تغيير في شكل `Note` يستلزم: تحديث `normalizeNote`، رفع `SCHEMA_VERSION` عند الحاجة، واختبار ترحيل (انظر skill `nawy-data-change`).
4. النسخ الاحتياطي/الاستيراد لا يُكسَّر: ملفات قديمة يجب أن تُفتح دائماً.

**الواجهة**
5. HTML المبني من نص المستخدم يمرّ عبر قالب `html\`\`` من `src/lib/html.ts` (يهرّب تلقائياً). `raw()` للأيقونات/SVG الموثوقة فقط. لا تُلصق نصاً خاماً داخل `innerHTML`.
6. RTL دائماً: خصائص منطقية (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`inset-inline`) لا `left/right`. `start-0` = اليمين.
7. أهداف اللمس ≥ 44px. أيقونات SVG من `lib/icons.ts` فقط (لا إيموجي للواجهة، ولا مكتبات أيقونات).
8. الألوان: لا hex مكرّر. ألوان الصفحة/العلامة من `brand.json`، والباقي رموز `@theme`. ادعم الوضع الداكن (`dark:`) في كل عنصر جديد.
9. لا تضف CSS transitions على `.note-card` (تتعارض مع حركة إعادة الترتيب `lib/reorder.ts` التي تستخدم Web Animations).
10. نوافذ/قوائم جديدة: `role="dialog"` + `trapFocus` + إغلاق بـ Esc.

**PWA والنشر**
11. `base: './'` لا يتغيّر (يعمل على مسار فرعي ونطاق مخصص).
12. تغيير manifest أو الأيقونات لا يظهر على التطبيق المثبَّت إلا بإعادة التثبيت؛ تغيير الكود يصل بزر «حدّث الآن».
13. لا تعتمد على `localStorage` لبيانات الملاحظات (للتفضيلات فقط، بمفاتيح `nawy-note:*`).

**الاعتماديات**
14. لا تضف اعتمادية جديدة بلا سبب مكتوب في `docs/decisions.md`. الحجم والبساطة أولاً.

**الشيفرة**
15. حدود الطبقات (`types ← data/pwa ← lib ← views`، `db ← editor/reader ← features ← main`) يفرضها ESLint؛ لا تستورد من طبقة أعلى. و`noUncheckedIndexedAccess` مفعّل: تحقّق من `arr[i]` قبل الاستخدام.

## سير العمل
1. اقرأ الملفات المعنية قبل التعديل؛ غيّر أقل ما يلزم؛ لا إعادة كتابة شاملة.
2. شغّل `npm test && npm run lint && npm run build` محلياً إن أمكن.
3. أضف/حدّث اختباراً لأي سلوك جديد (وحدة للمنطق النقي، e2e لما يخص المتصفح/IndexedDB).
4. سجّل أي قرار معماري/منتج في `docs/decisions.md` (التاريخ · القرار · السبب · البدائل).
5. Commit صغير ورسالة واضحة. بعد الدفع إلى `main` **راقب Actions حتى ينتهي**: الفشل يعني أن المستخدم لا يرى التعديل.
6. CI يمنع النشر عند فشل: lint، اختبارات الوحدات، البناء/الأنواع، e2e.

## فخاخ معروفة
- `node --test tests/*.test.ts` يشغّل TypeScript بإزالة الأنواع فقط: **لا enum ولا namespace ولا parameter properties** في الملفات التي تستوردها تلك الاختبارات (`data/envelope.ts`, `pwa/install.ts`).
- `Dexie.modify(cb)`: يجب ألا يُرجع الـ callback قيمة (استخدم كتلة `{}`).
- متغير محلي باسم `st` يظلّل حالة المحرر (`editor/session.ts`)؛ تجنّب الاسم.
- ترتيب الإضافات في `vite.config.ts`: `brandTokens()` قبل `tailwindcss()`.
- بيئات الـ sandbox قد تحجب npm (403): اعتمد على CI للتحقق الحقيقي.

## ممنوع بلا موافقة صريحة من المالك
تسجيل دخول/خادم/مزامنة إجبارية، لوحة تحكم أو تصنيفات معقدة، تتبّع/تحليلات، تغيير اسم قاعدة البيانات `nawy-note-db`، حذف بيانات المستخدم، دمج مع تطبيق ناوي الرئيسي (المنتج مستقل بهوية ناوي ويُدمج لاحقاً).

## للوكلاء: تحقق قبل أن تقول «تمّ»
اشغّل الأوامر فعلاً وانظر نتيجتها. لا تفترض النجاح. اذكر ما لم تستطع التحقق منه.
