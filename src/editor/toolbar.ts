import { COLOR_IDS, COLOR_LABELS, type ColorId } from '../types';
import { restoreState, setStatus } from '../db';
import { $ } from '../lib/util';
import { icon } from '../lib/icons';
import { toast } from '../lib/toast';
import { st, hooks, notifySaved, showSaved, touch } from './session';
import { toggleListMode } from './text';
import { addImage, startRecording } from './media';
import { startDrawing } from './draw-mode';

// ============================================================
//  الشريط السفلي: + / اللون / تثبيت / أرشفة / حذف / تم
// ============================================================

/** الشريط العلوي: رجوع واحد يحفظ تلقائياً + تثبيت/أرشفة/حذف. */
export function renderTop() {
  const n = st.current;
  if (!n) return;
  const t = $('#editorTop');
  t.style.display = '';
  t.innerHTML = `
    <button type="button" id="eDone" class="btn-icon !h-12 !w-12 !rounded-full" title="رجوع (يُحفظ تلقائياً)" aria-label="رجوع">${icon('back', 'w-6 h-6')}</button>
    <span class="flex-1"></span>
    <button type="button" id="ePin" class="btn-icon !rounded-full ${n.pinned ? 'active' : ''}" title="تثبيت" aria-label="تثبيت">${icon('pin')}</button>
    <button type="button" id="eArchive" class="btn-icon !rounded-full" title="${n.status === 'archived' ? 'إلغاء الأرشفة' : 'أرشفة'}" aria-label="أرشفة">${icon('archive')}</button>
    <button type="button" id="eTrash" class="btn-icon !rounded-full hover:!text-red-500" title="نقل للمهملات" aria-label="نقل للمهملات">${icon('trash')}</button>`;
  const f = t;
  $('#ePin', f).onclick = () => {
    n.pinned = !n.pinned;
    touch();
    renderTop();
  };
  $('#eDone', f).onclick = () => void hooks.closeEditor();

  const leave = async (status: 'archived' | 'trashed' | 'active', msg: string) => {
    const id = n.id;
    const prev = { status: n.status, pinned: n.pinned };
    n.status = status;
    st.dirty = true;
    await hooks.closeEditor();
    await setStatus(id, status);
    notifySaved(id, true);
    toast(msg, {
      label: 'تراجع',
      run: () => void restoreState(id, prev.status, prev.pinned).then(() => notifySaved(id, true)),
    });
  };
  $('#eArchive', f).onclick = () =>
    void leave(
      n.status === 'archived' ? 'active' : 'archived',
      n.status === 'archived' ? 'أُعيدت من الأرشيف' : 'تمت الأرشفة',
    );
  $('#eTrash', f).onclick = () => void leave('trashed', 'نُقلت إلى المهملات');
}

export function renderFooter() {
  const n = st.current;
  if (!n) return;
  const f = $('#editorFooter');
  f.style.display = '';

  const addMenu = `<div id="ePop" role="menu" class="absolute bottom-full start-2 z-10 mb-2 w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <button type="button" role="menuitem" data-add="image" class="menu-item">${icon('image')} صورة</button>
      <button type="button" role="menuitem" data-add="audio" class="menu-item">${icon('mic')} تسجيل صوتي</button>
      <button type="button" role="menuitem" data-add="draw" class="menu-item">${icon('pencil')} رسم</button>
      <div class="my-1 border-t border-slate-100 dark:border-slate-800"></div>
      <button type="button" role="menuitem" data-add="list" class="menu-item">${icon('list')} ${n.type === 'list' ? 'إخفاء خانات الاختيار' : 'إظهار خانات الاختيار'}</button>
    </div>`;
  const colorMenu = `<div id="ePop" class="absolute bottom-full start-2 z-10 mb-2 flex w-[15.5rem] max-w-[calc(100vw-1.5rem)] flex-wrap rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      ${COLOR_IDS.map(
        (c) => `<button type="button" data-color="${c}" title="${COLOR_LABELS[c]}" aria-label="${COLOR_LABELS[c]}"
          class="flex h-11 w-11 items-center justify-center"><span class="block h-8 w-8 rounded-full border-2 nc-${c} ${n.color === c ? 'border-slate-700 dark:border-white' : 'border-black/10 dark:border-white/20'}"></span></button>`,
      ).join('')}</div>`;

  f.innerHTML = `
    <div class="flex items-center gap-1">
      <button type="button" id="eAdd" class="btn-icon ${st.pop === 'add' ? 'active' : ''}" title="إضافة" aria-label="إضافة" aria-haspopup="menu" aria-expanded="${st.pop === 'add'}">${icon('plus')}</button>
      <button type="button" id="ePalette" class="btn-icon ${st.pop === 'color' ? 'active' : ''}" title="اللون" aria-label="اللون">${icon('palette')}</button>
    </div>
    <span id="eSaved" class="flex items-center gap-1 pe-3 text-xs text-slate-500 dark:text-slate-400"></span>
    ${st.pop === 'add' ? addMenu : st.pop === 'color' ? colorMenu : ''}`;

  $('#eAdd', f).onclick = () => {
    st.pop = st.pop === 'add' ? null : 'add';
    renderFooter();
  };
  $('#ePalette', f).onclick = () => {
    st.pop = st.pop === 'color' ? null : 'color';
    renderFooter();
  };

  const menu = f.querySelector<HTMLElement>('#ePop');
  if (menu) {
    menu.onclick = (e) => {
      const t = e.target as HTMLElement;
      const add = t.closest<HTMLElement>('[data-add]')?.dataset.add;
      const col = t.closest<HTMLElement>('[data-color]')?.dataset.color as ColorId | undefined;
      if (col) {
        n.color = col;
        touch();
        st.pop = null;
        hooks.applyColor(n);
        renderFooter();
      } else if (add === 'list') toggleListMode();
      else if (add) {
        st.pop = null;
        renderFooter();
        if (add === 'image') void addImage();
        else if (add === 'audio') void startRecording();
        else if (add === 'draw') startDrawing();
      }
    };
  }

  showSaved(!st.dirty);
}
