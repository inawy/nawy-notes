type W = Window & { __nawyReport?: (m: string, tag?: string) => void; __nawyDone?: () => void };

/** يعرض الخطأ في شريط أحمر مرئي (معرَّف في index.html) بدل أن يضيع في وحدة التحكم. */
export function reportError(msg: string): void {
  console.error(msg);
  (window as W).__nawyReport?.(msg);
}

/** يُستدعى بعد اكتمال الإقلاع فيُخفي تحذير "لم يبدأ التطبيق". */
export function appReady(): void {
  (window as W).__nawyDone?.();
}

/** رسالة مفهومة لأخطاء قاعدة البيانات الشائعة. */
export function dbMessage(err: unknown): string {
  const e = err as { name?: string; message?: string; inner?: { name?: string; message?: string } } | undefined;
  const name = [e?.name, e?.inner?.name].filter(Boolean).join('/');
  const msg = e?.inner?.message || e?.message || String(err);
  let hint = '';
  if (/Security|InvalidState|NotAllowed|Unknown|OpenFailed/i.test(name) || /denied|storage|not allowed/i.test(msg)) {
    hint =
      ' — قد يمنع المتصفح التخزين المحلي (وضع التصفح الخاص، أو فتح الملف مباشرة من القرص). جرّب نافذة عادية، أو افتح التطبيق عبر رابط https أو localhost.';
  } else if (/Version/i.test(name)) {
    hint = ' — قاعدة البيانات أحدث من هذه النسخة؛ استخدم أحدث ملف.';
  }
  return `تعذّر استخدام قاعدة البيانات (${name || 'خطأ'}): ${msg}${hint}`;
}
