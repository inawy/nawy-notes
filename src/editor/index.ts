import { type Note } from '../types';
import { deleteForever, isEmptyNote } from '../db';
import { $ } from '../lib/util';
import { html } from '../lib/html';
import { clearDraft } from '../lib/draft';
import { hooks, st, notifySaved, persist, releaseUrls, save, touch, type InitialAction } from './session';
import { popHist, pushHist, trackViewport } from './viewport';
import { renderList, renderText } from './text';
import { addImage, renderMedia, startRecording, stopRecording } from './media';
import { renderDrawMode, startDrawing } from './draw-mode';
import { renderFooter, renderTop } from './toolbar';

export function isEditorOpen(): boolean {
  return st.current !== null;
}

/** حفظ فوري دون إغلاق (عند إخفاء الصفحة). */
export async function flushEditor(): Promise<void> {
  save.cancel();
  if (st.current && st.dirty && !isEmptyNote(st.current)) {
    await persist();
  }
}

/** isNew: ملاحظة جديدة لم تُحفظ بعد — تُهمَل إن بقيت فارغة. */
export function openEditor(note: Note, isNew: boolean, initial?: InitialAction): void {
  st.current = structuredClone(note);
  st.baseUpdatedAt = note.updatedAt;
  st.dirty = isNew;
  st.closing = false;
  st.pop = null;
  st.drawingId = null;

  const el = $('#editor');
  el.classList.remove('hidden');
  el.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  trackViewport(true);
  pushHist();
  el.onclick = (e) => {
    if (e.target === el) void closeEditor();
  };
  $('#editorCard').onclick = (e) => {
    // النقر خارج النافذة المنبثقة يغلقها
    if (st.pop && !(e.target as HTMLElement).closest('#ePop, #eAdd, #ePalette')) {
      st.pop = null;
      renderFooter();
    }
  };
  renderAll();

  // هذه الاستدعاءات متزامنة مع نقرة المستخدم (شرط إذن الميكروفون ونافذة الملفات)
  if (initial === 'draw') startDrawing();
  else if (initial === 'audio') void startRecording();
  else if (initial === 'image') void addImage(true);
  else document.getElementById('eTitle')?.focus();
}

export async function closeEditor(): Promise<void> {
  const n = st.current;
  if (!n || st.closing) return;
  st.closing = true;
  if (st.recorder) await stopRecording(true); // لا نُضيّع تسجيلاً جارياً
  save.cancel();
  n.attachments = n.attachments.filter((a) => a.kind !== 'draw' || (a.drawing?.strokes.length ?? 0) > 0);

  const empty = isEmptyNote(n);
  const wasDirty = st.dirty;
  if (!empty && st.dirty && !(await persist())) {
    // فشل الحفظ: يبقى المحرر مفتوحاً بكل محتواه ولا نخسر شيئاً
    st.closing = false;
    return;
  }
  st.board?.destroy();
  st.board = null;
  st.drawingId = null;
  clearInterval(st.timerId);
  releaseUrls();
  st.current = null;

  if (empty) {
    await deleteForever(n.id); // لا يوجد شيء يُحفظ
    clearDraft(n.id);
    notifySaved(n.id, false);
  } else if (wasDirty) {
    notifySaved(n.id, true);
  }
  st.dirty = false;

  const el = $('#editor');
  el.classList.add('hidden');
  el.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
  trackViewport(false);
  popHist();
}

export function applyColor(n: Note) {
  $('#editorCard').className =
    `modal-enter relative flex h-full w-full flex-col overflow-hidden border border-black/5 shadow-2xl dark:border-white/10 ${st.drawingId ? 'sm:h-[92dvh]' : 'sm:h-auto'} sm:max-h-[92dvh] sm:max-w-xl sm:rounded-2xl lg:max-w-3xl ${st.drawingId ? '' : 'lg:min-h-[26rem]'} nc-${n.color}`;
}

export function renderAll() {
  const n = st.current;
  if (!n) return;
  applyColor(n);
  if (st.drawingId) renderDrawMode(n);
  else renderNote(n);
}

// ============================================================
//  عرض الملاحظة
// ============================================================
export function renderNote(n: Note) {
  renderTop();
  $('#editorBody').onclick = null; // معالج وضع الرسم لا يجب أن يبقى بعد الخروج منه
  $('#editorBody').className = 'flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5';
  $('#editorBody').innerHTML = String(html`
    <div id="eMedia"></div>
    <input id="eTitle" type="text" value="${n.title}" placeholder="العنوان"
      class="mb-3 w-full bg-transparent text-xl font-semibold outline-none placeholder:text-slate-400" />
    <div id="eContent"></div>`);
  $<HTMLInputElement>('#eTitle').addEventListener('input', (e) => {
    n.title = (e.target as HTMLInputElement).value;
    touch();
  });
  renderMedia();
  const content = $('#eContent');
  if (n.type === 'list') renderList(n, content);
  else renderText(n, content);
  renderFooter();
}

// ربط الدوال التي تحتاجها الوحدات الأخرى دون استيراد دائري
hooks.renderAll = renderAll;
hooks.renderNote = renderNote;
hooks.applyColor = applyColor;
hooks.closeEditor = closeEditor;

export { setOnSaved, type InitialAction } from './session';
