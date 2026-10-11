import { $ } from '../lib/util';
import { html, raw } from '../lib/html';
import { icon } from '../lib/icons';
import { trapFocus } from '../lib/focus-trap';
import type { ImportPlan, PlanKind } from '../data/import-plan';

const KIND_LABEL: Record<PlanKind, string> = { add: 'جديدة', update: 'تُحدَّث', remove: 'تُحذف' };
const KIND_CLASS: Record<PlanKind, string> = {
  add: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  update: 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300',
  remove: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

/** نافذة معاينة قبل الاستيراد. تُحلّ بـ true عند التأكيد وfalse عند الإلغاء/Esc. */
export function showImportPreview(plan: ImportPlan, fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.id = 'importPreview';
    wrap.className = 'fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'ipTitle');

    const stat = (n: number, label: string, kind?: PlanKind) =>
      n
        ? html`<li class="flex items-center gap-2 py-1.5 text-sm"><span class="min-w-8 rounded-lg px-2 py-0.5 text-center font-semibold ${kind ? KIND_CLASS[kind] : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">${n}</span><span>${label}</span></li>`
        : '';
    const btn = 'min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold';

    wrap.innerHTML = String(html`
      <div class="sheet-enter flex max-h-[85dvh] w-full max-w-md flex-col rounded-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
        <div class="mb-2 flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">${raw(icon('upload', 'w-5 h-5'))}</span>
          <div class="min-w-0 flex-1">
            <h2 id="ipTitle" class="text-lg font-semibold">معاينة الاستيراد</h2>
            <p class="truncate text-xs text-slate-500 dark:text-slate-400" dir="ltr">${fileName}</p>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <ul>
            ${stat(plan.add, 'ملاحظة جديدة ستُضاف', 'add')}
            ${stat(plan.update, 'ملاحظة موجودة ستُستبدل بنسخة أحدث من الملف', 'update')}
            ${stat(plan.remove, 'ملاحظة عندك سيحذفها الملف', 'remove')}
            ${stat(plan.same, 'مطابقة لما عندك (بلا تغيير)')}
            ${stat(plan.older, 'عندك منها نسخة أحدث فتُترك')}
          </ul>
          ${
            plan.samples.length
              ? html`<ul class="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  ${plan.samples.map(
                    (s) => html`<li class="flex items-center gap-2 px-3 py-2 text-sm"><span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] ${KIND_CLASS[s.kind]}">${KIND_LABEL[s.kind]}</span><span class="min-w-0 truncate">${s.title}</span></li>`,
                  )}
                </ul>`
              : ''
          }
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">تؤخذ لقطة أمان قبل التنفيذ، ويمكنك التراجع من «اللقطات التلقائية».</p>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" id="ipCancel" class="${btn} bg-slate-100 dark:bg-white/10">إلغاء</button>
          <button type="button" id="ipOk" class="${btn} bg-brand-500 text-white">استيراد</button>
        </div>
      </div>`);
    document.body.appendChild(wrap);

    let release: (() => void) | null = null;
    const done = (ok: boolean) => {
      release?.();
      wrap.remove();
      resolve(ok);
    };
    wrap.onclick = (e) => {
      if (e.target === wrap) done(false);
    };
    $('#ipCancel', wrap).onclick = () => done(false);
    $('#ipOk', wrap).onclick = () => done(true);
    release = trapFocus(wrap, { onEscape: () => done(false), initial: $('#ipCancel', wrap) });
  });
}
