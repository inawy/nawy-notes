---
name: nawy-data-change
description: Use when changing the Note shape, Dexie schema/indexes, status values, backup/import format, or deletion logic in Nawy Note. Guards against data loss and broken migrations.
---

# تغيير بنية البيانات بأمان

بيانات المستخدم لا تُفقد. اتبع هذه الخطوات بالترتيب.

1. **اقرأ**: `src/types.ts`, `src/db.ts`, `src/data/envelope.ts`, `docs/decisions.md` (قسم الشواهد).
2. **لا تعدّل نسخة سابقة**: غيّر الفهارس بـ `this.version(n+1).stores({...})` فقط. حقل غير مفهرس لا يحتاج نسخة جديدة.
3. **ترحيل عند القراءة**: أضف المنطق في `normalizeNote` (آمن للتكرار، يقبل الصيغ القديمة). تجنّب `upgrade()`.
4. **المغلف**: إن تغيّر شكل الملاحظة المصدَّرة ارفع `SCHEMA_VERSION` في `envelope.ts`، وتأكد أن `parseEnvelope` يقبل الملفات الأقدم.
5. **الحذف**: لا `db.notes.delete` لمحتوى المستخدم؛ استخدم `deleteForever`/`tombstone`. الحالة `deleted` لا تظهر في أي عرض ولا تُحتسب.
6. **الاختبارات المطلوبة**
   - وحدة (`tests/envelope.test.ts`): الصيغة القديمة → الحديثة، وآمن للتكرار.
   - e2e (`e2e/notes.spec.ts`): ابذر قاعدة بالنسخة القديمة عبر `indexedDB.open('nawy-note-db', 10*version)` ثم افتح التطبيق وتحقق أن الملاحظات تظهر (انظر اختبار «ترحيل»).
7. **الاستيراد**: الدمج بـ `updatedAt` الأحدث؛ تأكد أن شاهد الحذف الأحدث يفوز.
8. سجّل القرار في `docs/decisions.md`.

لا تغيّر اسم القاعدة `nawy-note-db`. Dexie يضرب رقم النسخة في 10 داخل IndexedDB.
