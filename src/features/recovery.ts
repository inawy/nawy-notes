import { db, getNote, newNote } from '../db';
import { html } from '../lib/html';
import { trapFocus } from '../lib/focus-trap';
import { toast } from '../lib/toast';
import { applyDraft, clearDraft, needsRecovery, readDraft } from '../lib/draft';
import { formatUsage } from '../lib/storage-errors';
import { dbMessage } from '../lib/report';
import { openEditor } from '../editor';
import { doBackup } from './backup';

/** يعرض استعادة مسودة غير محفوظة (بقيت بعد إغلاق مفاجئ أو فشل حفظ). */
export async function recoverDraft(): Promise<void> {
  const d = readDraft();
  if (!d) return;
  try {
    const existing = await getNote(d.id);
    if (existing?.status === 'deleted' || !needsRecovery(d, existing?.updatedAt)) return clearDraft(d.id);
    toast('وُجدت مسودة غير محفوظة من جلسة سابقة', {
      label: 'استعادة',
      run: () => openEditor(applyDraft(existing ?? { ...newNote(d.type), id: d.id }, d), !existing),
    });
  } catch {
    /* قاعدة البيانات غير جاهزة: تبقى المسودة لمحاولة لاحقة */
  }
}

async function storageInfo(): Promise<string> {
  try {
    const e = await navigator.storage?.estimate?.();
    return formatUsage(e?.usage, e?.quota);
  } catch {
    return '';
  }
}

/** إعادة تحميل نظيفة: تُسقط عامل الخدمة والكاش فقط؛ لا تلمس IndexedDB (بيانات المستخدم). */
export async function cleanReload(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } catch {
    /* نكمل إلى إعادة التحميل على أي حال */
  }
  location.reload();
}

/** شاشة استرداد عند تعذّر فتح قاعدة البيانات. لا تحذف أي بيانات. */
export async function showDbRecovery(err: unknown): Promise<void> {
  if (document.getElementById('dbRecovery')) return;
  const usage = await storageInfo();
  const el = document.createElement('div');
  el.id = 'dbRecovery';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'dbRecTitle');
  el.className = 'fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4';
  const btn = 'min-h-11 w-full rounded-xl px-4 py-2 text-sm font-semibold';
  el.innerHTML = String(html`
    <div class="w-full max-w-md rounded-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-[#1e1e1e] dark:text-slate-100">
      <h2 id="dbRecTitle" class="mb-2 text-lg font-bold">تعذّر فتح بياناتك</h2>
      <p class="mb-1 text-sm">بياناتك لم تُحذف. جرّب الخطوات بالترتيب:</p>
      <p class="mb-3 text-xs text-slate-500 dark:text-slate-400" data-testid="dbRecMsg">${dbMessage(err)}</p>
      ${usage ? html`<p class="mb-3 text-xs text-slate-500 dark:text-slate-400">${usage}</p>` : ''}
      <div class="flex flex-col gap-2">
        <button type="button" id="dbRecRetry" class="${btn} bg-brand-600 text-white">إعادة المحاولة</button>
        <button type="button" id="dbRecExport" class="${btn} bg-slate-100 dark:bg-white/10">تصدير ما يمكن قراءته</button>
        <button type="button" id="dbRecClean" class="${btn} bg-slate-100 dark:bg-white/10">إعادة تحميل نظيفة (بدون مسح البيانات)</button>
        <button type="button" id="dbRecClose" class="${btn} text-slate-500">إغلاق</button>
      </div>
    </div>`);
  document.body.appendChild(el);
  const release = trapFocus(el, { onEscape: close, initial: el.querySelector<HTMLElement>('#dbRecRetry') });
  function close() {
    release();
    el.remove();
  }
  const on = (id: string, fn: () => void | Promise<void>) => {
    el.querySelector<HTMLButtonElement>(id)!.onclick = () => void fn();
  };
  on('#dbRecRetry', async () => {
    try {
      if (db.isOpen()) db.close();
      await db.open();
      location.reload();
    } catch (e) {
      toast(dbMessage(e));
    }
  });
  on('#dbRecExport', async () => {
    try {
      await doBackup();
      toast('تم تصدير النسخة');
    } catch (e) {
      toast(`تعذّر التصدير: ${(e as Error)?.message ?? e}`);
    }
  });
  on('#dbRecClean', cleanReload);
  on('#dbRecClose', close);
}
