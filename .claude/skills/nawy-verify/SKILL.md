---
name: nawy-verify
description: Use before saying a change to Nawy Note is done, before pushing to main, or when CI fails. Runs the project's checks in order and polls GitHub Actions to confirm the deploy succeeded.
---

# التحقق من تعديل في ناوي نوت

## محلياً (بالترتيب)
1. `npm run typecheck`
2. `npm run lint` — يجب صفر تحذيرات.
3. `npm test` — node:test + vitest.
4. `npm run build`
5. إن لمس التعديل واجهة/بيانات: `npx playwright test` (يبني ويشغّل preview).

إن حُجب npm في البيئة (403) فاكتفِ بما يمكن تشغيله وقل صراحةً ما لم يُشغَّل؛ CI هو المرجع.

## بعد الدفع إلى `main`
1. `git fetch && git rebase origin/main` قبل `git push`.
2. راقب آخر تشغيل: `gh api repos/inawy/nawy-notes/actions/runs?per_page=1 --jq '.workflow_runs[0]|[.status,.conclusion]|@tsv'` حتى `completed`.
3. إن فشل: افتح خطوات الـ jobs (`.../runs/<id>/jobs`) وتعليقات `check-runs/<id>/annotations` (سجلات الخطوات نفسها قد لا تُقرأ). أصلح وادفع مجدداً؛ لا تترك `main` فاشلاً.
4. النجاح = jobs `build` و`e2e` و`deploy` كلها `success`.

## أعطال شائعة
- `TS6133` متغير/استيراد غير مستخدم → احذفه (البناء يفشل).
- خطأ Dexie `No overload matches` في `modify` → لا تُرجع قيمة من callback.
- e2e يفشل على نص/محدد → راجع المحددات (`#fab`, `#eTitle`, `#eSaved`, `.note-card`, `#tabs [data-view]`).
