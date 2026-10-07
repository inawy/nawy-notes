---
name: nawy-ui-conventions
description: Use when adding or changing any UI in Nawy Note (cards, sheets, buttons, icons, colors, dark mode, gestures). Enforces RTL, accessibility, touch size, escaping and design tokens.
---

# اتفاقيات الواجهة

## الشكل
- **RTL**: منطقية فقط — `ms-/me-/ps-/pe-/start-/end-/text-start`. `start-0` = اليمين.
- **اللمس**: أهداف ≥ 44px (`min-h-11 min-w-11`)، وللأزرار الدائرية `btn-icon`.
- **الأيقونات**: `icon('name', 'w-6 h-6')` من `src/lib/icons.ts` (SVG بخط `stroke`). أضف الأيقونة الجديدة هناك بنفس الأسلوب (24×24، `stroke-width` 2).
- **الألوان**: رموز `brand-*` و`slate-*` المعرّفة في `@theme`. الخلفيات والـ theme-color من `brand.json`. لون الملاحظة عبر `nc-<color>` و`--n-*` (فاتحة مخفّفة / داكنة خافتة).
- **داكن**: لكل `bg-`/`text-`/`border-` جديد قرين `dark:`. الداكن رمادي محايد (لا أزرق).
- **الحركة**: قصيرة (≤ 200ms)، وتُلغى تحت `prefers-reduced-motion` (انظر آخر `style.css`). لا transitions على `.note-card`.

## الأمان والبنية
- النص القادم من المستخدم: `html\`...${value}...\`` من `lib/html.ts` (تهريب تلقائي). `raw()` للأيقونات وSVG الموثوقة فقط.
- العناصر الثابتة في `index.html`؛ الديناميكية تُبنى في `views/` أو الوحدة المعنية. الدوال النقية (مثل `cardHTML`) لا تقرأ حالة التطبيق — تأخذ `ctx`.
- ميزة جديدة = ملف في `src/features/` بدالة `mountX()` تُستدعى من `main.ts`.

## التفاعل وإمكانية الوصول
- نافذة/قائمة/ورقة: `role="dialog"` + `aria-modal` + `trapFocus(el, { onEscape })` من `lib/focus-trap.ts`، وإغلاق بالسحب عبر `swipeDismiss` عند الحاجة.
- أزرار الأيقونات تحمل `aria-label` بالعربية. لا تعتمد على اللون وحده.
- منع تحديد النص عام (`user-select:none`) عدا الحقول — لا تكسره.
- السويب بين الأقسام: `features/tab-swipe.ts` (dx ≥ 48 و|dx| ≥ 1.2|dy|)؛ لا تضف مستمعين يتعارضون معه.

## اختبر
- وحدة للمنطق النقي، و`e2e/notes.spec.ts` للتدفق. ثبّت محددات مستقرة (`id`) ولا تعتمد على نص يتغيّر.
