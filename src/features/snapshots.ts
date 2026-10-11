import { $ } from '../lib/util';
import { html, raw } from '../lib/html';
import { icon } from '../lib/icons';
import { toast } from '../lib/toast';
import { trapFocus } from '../lib/focus-trap';
import { formatBytes, REASON_LABEL } from '../lib/snapshot-policy';
import {
  deleteSnapshot,
  getSnapshotBlob,
  listSnapshots,
  maybeAutoSnapshot,
  restoreSnapshot,
  type SnapshotInfo,
} from '../snapshots';

let release: (() => void) | null = null;
let wrap: HTMLElement | null = null;

export const isSnapshotsOpen = () => wrap !== null;

function close() {
  release?.();
  release = null;
  wrap?.remove();
  wrap = null;
}

const when = (t: number) => new Date(t).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });

function rowHtml(s: SnapshotInfo) {
  const btn = 'min-h-11 rounded-xl px-3 text-xs font-semibold';
  return html`<li class="py-3" data-id="${s.id}">
    <div class="flex items-center gap-2">
      <span class="flex-1 text-sm font-medium">${when(s.createdAt)}</span>
      <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">${REASON_LABEL[s.reason]}</span>
    </div>
    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">${s.notes} ملاحظة · ${formatBytes(s.size)}${s.lite ? ' · خفيفة (بلا صور وصوت)' : ''}</p>
    <div class="mt-2 flex flex-wrap gap-2">
      <button type="button" data-act="restore-deleted" class="${btn} bg-brand-500 text-white">استرجاع المحذوف</button>
      ${s.lite ? '' : html`<button type="button" data-act="restore-all" class="${btn} bg-slate-100 dark:bg-white/10">العودة لهذه النسخة</button>`}
      <button type="button" data-act="download" class="${btn} bg-slate-100 dark:bg-white/10">تنزيل</button>
      <button type="button" data-act="delete" class="${btn} text-red-500">حذف</button>
    </div>
  </li>`;
}

async function fill() {
  if (!wrap) return;
  const list = await listSnapshots();
  $('#snList', wrap).innerHTML = list.length
    ? String(html`<ul class="divide-y divide-slate-100 dark:divide-slate-800">${list.map(rowHtml)}</ul>`)
    : '<p class="py-6 text-center text-sm text-slate-400">لا توجد لقطات بعد. تُؤخذ أول لقطة تلقائياً بعد فتح التطبيق بقليل.</p>';
}

async function onAct(act: string, id: string) {
  try {
    if (act === 'restore-deleted') {
      const n = await restoreSnapshot(id, 'deleted');
      toast(n ? `استُرجعت ${n} ملاحظة` : 'لا توجد ملاحظات محذوفة تُسترجع من هذه اللقطة');
    } else if (act === 'restore-all') {
      if (!confirm('العودة لهذه النسخة تستبدل تعديلاتك اللاحقة على الملاحظات الموجودة فيها (وتُبقي ما أنشأته بعدها). تؤخذ لقطة أمان أولاً. متابعة؟')) return;
      const n = await restoreSnapshot(id, 'all');
      toast(`عادت ${n} ملاحظة إلى حالتها في اللقطة`);
    } else if (act === 'download') {
      const b = await getSnapshotBlob(id);
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `nawy-note-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else if (act === 'delete') {
      if (!confirm('حذف هذه اللقطة؟')) return;
      await deleteSnapshot(id);
    }
    await fill();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'تعذّرت العملية');
  }
}

export function showSnapshots(): void {
  if (wrap) return;
  wrap = document.createElement('div');
  wrap.id = 'snapshots';
  wrap.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'snTitle');
  wrap.innerHTML = String(html`
    <div class="sheet-enter flex max-h-[85dvh] w-full max-w-md flex-col rounded-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
      <div class="mb-1 flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">${raw(icon('clock', 'w-5 h-5'))}</span>
        <h2 id="snTitle" class="flex-1 text-lg font-semibold">اللقطات التلقائية</h2>
        <button type="button" id="snClose" class="btn-icon !rounded-full" aria-label="إغلاق">${raw(icon('x', 'w-5 h-5'))}</button>
      </div>
      <p class="mb-2 text-xs text-slate-500 dark:text-slate-400">نسخ احتياطية محلية على هذا الجهاز تؤخذ تلقائياً مرة يومياً عند تغيّر ملاحظاتك، وقبل الاستيراد وإفراغ المهملات. تُحفظ آخر 5 فقط. للحماية من فقدان الجهاز نفسه نزّل نسخة خارجية من «نسخ احتياطي».</p>
      <div id="snList" class="min-h-0 flex-1 overflow-y-auto"></div>
    </div>`);
  document.body.appendChild(wrap);
  wrap.onclick = (e) => {
    if (e.target === wrap) close();
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const id = b?.closest<HTMLElement>('[data-id]')?.dataset.id;
    if (b?.dataset.act && id) void onAct(b.dataset.act, id);
  };
  $('#snClose', wrap).onclick = close;
  release = trapFocus(wrap, { onEscape: close, initial: $('#snClose', wrap) });
  void fill();
}

export function mountSnapshots(): void {
  $('#btnSnapshots').innerHTML = icon('clock') + '<span>اللقطات التلقائية</span>';
  $('#btnSnapshots').onclick = () => showSnapshots();
  // بعد استقرار الإقلاع: لا نزاحم أول رسم
  const run = () => void maybeAutoSnapshot();
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 8000 });
  else setTimeout(run, 5000);
}
