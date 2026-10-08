/** أخطاء التخزين: منطق نقي بلا اعتماد على المتصفح (يُختبر بـ vitest). */
type ErrLike = { name?: string; message?: string; inner?: ErrLike; code?: number } | undefined | null;

/** هل الخطأ بسبب امتلاء مساحة التخزين؟ (يشمل الأخطاء المغلّفة داخل Dexie عبر inner) */
export function isQuotaError(err: unknown): boolean {
  const e = err as ErrLike;
  if (!e) return false;
  if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) return true;
  if (/quota|storage.*full|disk.*full/i.test(e.message ?? '')) return true;
  return isQuotaError(e.inner);
}

/** رسالة عربية واضحة لفشل الحفظ. */
export function saveErrorMessage(err: unknown): string {
  return isQuotaError(err)
    ? 'مساحة التخزين ممتلئة — لم تُحفظ الملاحظة. أفرغ المهملات أو احذف مرفقات كبيرة ثم أعد المحاولة. مسودتك محفوظة مؤقتاً.'
    : 'تعذّر حفظ الملاحظة — ستُعاد المحاولة. مسودتك محفوظة مؤقتاً.';
}

/** وصف مقروء لاستخدام التخزين، أو '' إن لم تتوفر البيانات. */
export function formatUsage(usage?: number, quota?: number): string {
  if (!usage || !quota) return '';
  const mb = (n: number) => (n / 1048576).toFixed(n >= 1048576 * 10 ? 0 : 1);
  return `المستخدم ${mb(usage)} م.ب من ${mb(quota)} م.ب (${Math.round((usage / quota) * 100)}٪)`;
}
