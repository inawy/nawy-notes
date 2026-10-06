import { type Note } from '../types';
import { $, uid } from '../lib/util';
import { icon } from '../lib/icons';
import { DrawingBoard, PEN_COLORS, PEN_SIZES } from '../lib/draw';
import { st, hooks, touch } from './session';

// ============================================================
//  وضع الرسم
// ============================================================
export function startDrawing(id?: string) {
  const n = st.current;
  if (!n) return;
  let att = id ? n.attachments.find((a) => a.id === id) : undefined;
  if (!att) {
    // مساحة الرسم الجديد بنسبة المساحة المتاحة في الشاشة (طولية على الهاتف) لتملأها تقريباً
    const big = window.innerWidth >= 640; // نافذة وسطية: 92% من الارتفاع وعرض أقصى 576px
    const availW = Math.min(window.innerWidth, 576) - 24;
    const availH = (big ? 0.92 : 1) * window.innerHeight - 150; // ناقص الشريط العلوي وأدوات الرسم
    const ratio = Math.min(1.8, Math.max(0.75, availH / availW));
    att = { id: uid(), kind: 'draw', blob: null, drawing: { width: 900, height: Math.round(900 * ratio), strokes: [] } };
    n.attachments.push(att);
  }
  st.drawingId = att.id;
  st.pop = null;
  hooks.renderAll();
}

export function endDrawing() {
  const n = st.current;
  st.board?.destroy();
  st.board = null;
  if (n && st.drawingId) {
    const att = n.attachments.find((a) => a.id === st.drawingId);
    if (att && !att.drawing?.strokes.length) n.attachments = n.attachments.filter((a) => a !== att); // رسم فارغ
  }
  st.drawingId = null;
  hooks.renderAll();
}

export function renderDrawMode(n: Note) {
  const att = n.attachments.find((a) => a.id === st.drawingId);
  if (!att?.drawing) {
    st.drawingId = null;
    return hooks.renderAll();
  }
  const d = att.drawing;
  const swatch = (c: string) =>
    `<button type="button" data-color="${c}" class="pen-color flex h-11 w-11 items-center justify-center" aria-label="لون القلم"><span class="block h-6 w-6 rounded-full border border-black/20" style="background:${c === 'ink' ? 'currentColor' : c}"></span></button>`;

  $('#editorFooter').style.display = 'none';
  $('#editorTop').style.display = 'none';
  const root = $('#editorBody');
  root.className = 'flex min-h-0 flex-1 flex-col overflow-hidden p-3';
  root.innerHTML = `
    <div class="flex shrink-0 items-center">
      <button type="button" id="dDone" class="btn-icon !rounded-full" title="تم" aria-label="تم">${icon('back', 'w-6 h-6')}</button>
      <span class="flex-1 ps-1 text-sm font-medium">رسم</span>
      <button type="button" id="dUndo" class="btn-icon" title="تراجع">${icon('undo')}</button>
      <button type="button" id="dClear" class="btn-icon" title="مسح الكل">${icon('trash')}</button>
    </div>
    <div class="no-scrollbar mb-2 flex shrink-0 items-center overflow-x-auto">
      <button type="button" data-tool="pen" class="tool btn-icon" title="قلم">${icon('pencil')}</button>
      <button type="button" data-tool="eraser" class="tool btn-icon text-xs font-medium" title="ممحاة">ممحاة</button>
      <span class="mx-1 h-5 w-px shrink-0 bg-black/10 dark:bg-white/20"></span>
      ${PEN_COLORS.map(swatch).join('')}
      <span class="mx-1 h-5 w-px shrink-0 bg-black/10 dark:bg-white/20"></span>
      ${PEN_SIZES.map((s) => `<button type="button" data-size="${s}" class="pen-size flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" aria-label="حجم القلم"><span class="rounded-full bg-st.current" style="width:${s + 2}px;height:${s + 2}px"></span></button>`).join('')}
    </div>
    <div id="dStage" class="flex min-h-0 flex-1 items-center justify-center">
      <div class="draw-surface overflow-hidden border border-black/10 dark:border-white/10">
        <canvas id="dCanvas" class="block text-slate-900 dark:text-slate-100" dir="ltr"></canvas>
      </div>
    </div>`;

  // أكبر مقاس ممكن يملأ المساحة المتاحة مع حفظ نسبة الرسم
  const stage = $('#dStage', root);
  const cv = $<HTMLCanvasElement>('#dCanvas', root);
  const fitCanvas = () => {
    const sw = stage.clientWidth - 2;
    const sh = stage.clientHeight - 2;
    if (sw <= 0 || sh <= 0) return;
    const k = Math.min(sw / d.width, sh / d.height);
    cv.style.width = `${Math.floor(d.width * k)}px`;
    cv.style.height = `${Math.floor(d.height * k)}px`;
  };
  fitCanvas();
  new ResizeObserver(fitCanvas).observe(stage);

  const b = new DrawingBoard(cv, d, () => {
    touch();
    refresh();
  });
  st.board = b;

  const refresh = () => {
    root.querySelectorAll<HTMLElement>('.tool').forEach((t) => t.classList.toggle('active', t.dataset.tool === b.tool));
    root.querySelectorAll<HTMLElement>('.pen-color').forEach((t) => {
      const on = t.dataset.color === b.color && b.tool === 'pen';
      const dot = t.firstElementChild as HTMLElement;
      dot.classList.toggle('ring-2', on);
      dot.classList.toggle('ring-brand-500', on);
      dot.classList.toggle('ring-offset-1', on);
    });
    root.querySelectorAll<HTMLElement>('.pen-size').forEach((t) =>
      t.classList.toggle('bg-black/10', Number(t.dataset.size) === b.size),
    );
    const undo = $<HTMLButtonElement>('#dUndo', root);
    undo.disabled = !b.canUndo;
    undo.classList.toggle('opacity-30', !b.canUndo);
  };

  root.onclick = (e) => {
    if (st.board !== b) return;
    const t = e.target as HTMLElement;
    const tool = t.closest<HTMLElement>('.tool');
    const col = t.closest<HTMLElement>('.pen-color');
    const size = t.closest<HTMLElement>('.pen-size');
    if (t.closest('#dDone')) return endDrawing();
    if (tool) b.tool = tool.dataset.tool as 'pen' | 'eraser';
    else if (col) {
      b.color = col.dataset.color!;
      b.tool = 'pen';
    } else if (size) b.size = Number(size.dataset.size);
    else if (t.closest('#dUndo')) b.undo();
    else if (t.closest('#dClear')) {
      if (d.strokes.length && confirm('مسح الرسم كاملاً؟')) b.clear();
    }
    refresh();
  };
  refresh();
}

