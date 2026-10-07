import type { Note } from '../types';
import { toast } from './toast';

/** نص قابل للمشاركة: العنوان ثم المحتوى (القوائم بعلامات ☐/☑). المرفقات الثنائية لا تُرسل. */
export function shareText(n: Note): { title: string; text: string } {
  const title = n.title.trim();
  const text =
    n.type === 'list'
      ? n.items
          .filter((i) => i.text.trim())
          .map((i) => `${i.done ? '☑' : '☐'} ${i.text.trim()}`)
          .join('\n')
      : n.body.trim();
  return { title, text };
}

/** مشاركة عبر ورقة النظام، وإلا النسخ للحافظة. لا يرمي إن أغلق المستخدم الورقة. */
export async function shareNote(n: Note): Promise<void> {
  const { title, text } = shareText(n);
  const full = [title, text].filter(Boolean).join('\n\n');
  if (!full) {
    toast('لا نص لمشاركته');
    return;
  }
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: title || undefined, text });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return; // المستخدم أغلق الورقة
  }
  try {
    await navigator.clipboard.writeText(full);
    toast('نُسخ النص إلى الحافظة');
  } catch {
    toast('تعذّرت المشاركة');
  }
}
