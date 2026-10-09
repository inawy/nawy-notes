# معمارية ناوي نوت

TypeScript عادي + DOM + Dexie. لا إطار واجهة. الفكرة: **IndexedDB هي الحقيقة الوحيدة، والواجهة تُعاد رسمها من استعلام حي**.

## تدفق البيانات
```
IndexedDB (Dexie: جدول notes)
   ▲  db.ts: saveNote / setStatus / deleteForever(شاهد) / reorderNotes / import
   │
liveQuery(() => listNotes(view, query, sort, dir))   ← يعيد التنفيذ عند أي تغيير (حتى من تبويب آخر)
   │
main.ts render(notes) → cardHTML(note, ctx) → innerHTML للشبكة
   │
تفاعل المستخدم: بطاقة → reader.ts (قراءة) → editor/ (تحرير، حفظ تلقائي 400ms) → saveNote → (يتكرر)
```

## الوحدات وحدودها
- **`db.ts`** وحده يلمس Dexie (+ `features/backup.ts` للعدّ). أي وصول آخر للجدول يمرّ منه.
- **`data/envelope.ts`** منطق نقي بلا DOM/Dexie (قابل لـ `node:test`): مغلف التصدير `{app:'nawy', product:'note', schemaVersion, data}` و`normalizeNote`.
- **`main.ts`** يملك حالة العرض (`view`, `query`, `sortMode`, `layout`) ويربط الأحداث. لا منطق بيانات فيه.
- **`views/card.ts`** دالة نقية: `cardHTML(note, {trash, layout, blobUrl})`.
- **`editor/`**: `session.ts` حالة الجلسة `st` + `hooks` (تمنع الاستيراد الدائري)، و`index.ts` يرسم، و`text/media/draw-mode/toolbar/viewport` كل منها مسؤولية واحدة.
- **`features/`**: كل ميزة مستقلة تُركَّب بـ `mountX()`؛ حذف ملف ميزة لا يكسر غيرها.
- **`lib/`**: أدوات بلا حالة تطبيق (`html`, `icons`, `util`, `toast`, `swipe-dismiss`, `focus-trap`, `draw`, `media`, `permission`).

### حدود الطبقات (يفرضها ESLint)
```
types ← data, pwa ← lib ← views        db ← editor, reader ← features ← main
```
الأدنى لا يستورد من الأعلى (`no-restricted-imports` في `eslint.config.js`). `lib/prefs.ts` يحوي منطق التفضيلات النقي (`parsePrefs`). حالة العرض ما زالت متغيرات داخل `main.ts` (استخراجها كاملة مؤجَّل لأنه يمسّ كل الدوال).

## نموذج الملاحظة (`types.ts`)
`id (UUID)`, `type: text|list`, `title`, `body`, `items[]`, `attachments[]` (صورة/صوت/رسم؛ Blob مخزّن مباشرة)، `color`, `order?`, `pinned`, `status: active|archived|trashed|deleted`, `createdAt`, `updatedAt`, `trashedAt`, `deletedAt?`.
- المعرّفات UUID و`updatedAt` و`deleted` (شاهد) = جاهزة لمزامنة مستقبلية بلا كسر.
- الحالات الثلاث الأولى تقابل العروض: الملاحظات / الأرشيف / المهملات. `deleted` لا يظهر.

## الترحيل
قاعدة `nawy-note-db`: `version(1)` ثم `version(2)` (نفس الفهارس). لا `upgrade()`؛ الصيغ القديمة (type draw/audio/image) تُحوَّل عند القراءة في `normalizeNote` وتُحفظ مع أول تعديل.

## البناء والجودة
```
push → Actions
  build : npm ci → lint → test (node:test + vitest) → build (tsc + vite) → artifact
  e2e   : npm ci → playwright (Chromium، IndexedDB حقيقية، بلا SW)
  deploy: يحتاج build و e2e → GitHub Pages
```
`brand.json` → إضافة Vite → `index.html` وCSS (+ manifest و`theme.ts`).

## قيود تصميمية ثابتة
محلي أولاً، بلا حساب/خادم/تحليلات؛ RTL؛ بساطة على غرار Keep؛ مستقل بهوية ناوي وقابل للدمج لاحقاً؛ يعمل بدون إنترنت.
