import { type Note } from '../types';
import { $, uid } from '../lib/util';
import { icon } from '../lib/icons';
import { DrawingBoard, HIGHLIGHTER_SCALE, PEN_COLORS, SIZE_MAX, SIZE_MIN, type Tool } from '../lib/draw';
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
    att = {
      id: uid(),
      kind: 'draw',
      blob: null,
      drawing: { width: 900, height: Math.round(900 * ratio), strokes: [] },
    };
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

// ---------- تفضيلات القلم (تُحفظ بين الرسومات) ----------
const PEN_KEY = 'nawy-note:pen';
interface PenPrefs {
  tool: Tool;
  color: string;
  size: number;
  custom: string | null;
}
const HEX = /^#[0-9a-f]{6}$/i;
function loadPen(): PenPrefs {
  const d: PenPrefs = { tool: 'pen', color: 'ink', size: 5, custom: null };
  try {
    const p = JSON.parse(localStorage.getItem(PEN_KEY) ?? '{}') as Partial<PenPrefs>;
    if (p.tool === 'pen' || p.tool === 'highlighter') d.tool = p.tool; // الممحاة لا تُستعاد: تبدأ بقلم دائماً
    if (typeof p.color === 'string' && (p.color === 'ink' || HEX.test(p.color))) d.color = p.color;
    if (typeof p.size === 'number' && p.size >= SIZE_MIN && p.size <= SIZE_MAX) d.size = Math.round(p.size);
    if (typeof p.custom === 'string' && HEX.test(p.custom)) d.custom = p.custom;
  } catch {
    /* افتراضي */
  }
  return d;
}
function savePen(p: PenPrefs) {
  try {
    localStorage.setItem(PEN_KEY, JSON.stringify(p));
  } catch {
    /* تجاهل */
  }
}

const TOOLS: { id: Tool; label: string; icon: Parameters<typeof icon>[0] }[] = [
  { id: 'pen', label: 'قلم', icon: 'pencil' },
  { id: 'highlighter', label: 'مظلِّل', icon: 'highlighter' },
  { id: 'eraser', label: 'ممحاة', icon: 'eraser' },
];

export function renderDrawMode(n: Note) {
  const att = n.attachments.find((a) => a.id === st.drawingId);
  if (!att?.drawing) {
    st.drawingId = null;
    return hooks.renderAll();
  }
  const d = att.drawing;
  const pen = loadPen();
  const swatch = (c: string) =>
    `<button type="button" data-color="${c}" class="pen-color flex h-11 w-11 items-center justify-center" aria-label="${c === 'ink' ? 'لون الحبر (يتكيّف مع الوضع)' : 'لون ' + c}"><span class="block h-7 w-7 rounded-full border border-black/15 dark:border-white/25" style="background:${c === 'ink' ? 'currentColor' : c}"></span></button>`;
  const customSwatch = `<label class="pen-color pen-custom relative flex h-11 w-11 cursor-pointer items-center justify-center" aria-label="لون مخصص">
      <span class="block h-7 w-7 rounded-full border border-black/15 dark:border-white/25" style="background:${pen.custom ?? 'conic-gradient(#ef4444,#facc15,#22c55e,#3b82f6,#a855f7,#ef4444)'}"></span>
      <input id="dCustom" type="color" value="${pen.custom ?? '#3b82f6'}" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="اختيار لون مخصص" />
    </label>`;

  $('#editorFooter').style.display = 'none';
  $('#editorTop').style.display = 'none';
  const root = $('#editorBody');
  root.className = 'flex min-h-0 flex-1 flex-col overflow-hidden p-3 pb-2';
  root.innerHTML = `
    <div class="flex shrink-0 items-center">
      <button type="button" id="dDone" class="btn-icon !rounded-full" title="تم" aria-label="تم">${icon('back', 'w-6 h-6')}</button>
      <span class="flex-1 ps-1 text-sm font-medium">رسم</span>
      <button type="button" id="dUndo" class="btn-icon" title="تراجع" aria-label="تراجع">${icon('undo')}</button>
      <button type="button" id="dRedo" class="btn-icon" title="إعادة" aria-label="إعادة">${icon('redo')}</button>
      <button type="button" id="dClear" class="btn-icon" title="مسح الكل" aria-label="مسح الكل">${icon('trash')}</button>
    </div>
    <div id="dStage" class="flex min-h-0 flex-1 items-center justify-center py-1">
      <div class="draw-surface overflow-hidden border border-black/10 dark:border-white/10">
        <canvas id="dCanvas" class="block text-slate-900 dark:text-slate-100" dir="ltr"></canvas>
      </div>
    </div>
    <div class="mt-1 shrink-0 rounded-2xl bg-black/[0.05] p-1.5 dark:bg-white/[0.08]" role="toolbar" aria-label="أدوات الرسم">
      <div class="flex items-center gap-1.5">
        <div class="flex shrink-0 gap-1" role="group" aria-label="الأداة">
          ${TOOLS.map((t) => `<button type="button" data-tool="${t.id}" class="tool flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl px-2 text-[11px] font-medium" aria-label="${t.label}" aria-pressed="false">${icon(t.icon, 'w-5 h-5')}<span>${t.label}</span></button>`).join('')}
        </div>
        <div class="flex min-w-0 flex-1 items-center gap-2 ps-1" dir="ltr">
          <input id="dSize" type="range" min="${SIZE_MIN}" max="${SIZE_MAX}" step="1" value="${pen.size}" class="h-11 min-w-0 flex-1 cursor-pointer accent-brand-500" aria-label="سماكة القلم" />
          <span class="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true"><span id="dDot" class="block rounded-full"></span></span>
        </div>
      </div>
      <div id="dColors" class="grid grid-cols-6 justify-items-center" role="group" aria-label="اللون">
        ${PEN_COLORS.map(swatch).join('')}${customSwatch}
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
  b.tool = pen.tool;
  b.color = pen.color;
  b.size = pen.size;
  st.board = b;

  const setDisabled = (el: HTMLElement, off: boolean) => {
    (el as HTMLButtonElement).disabled = off;
    el.classList.toggle('opacity-30', off);
  };

  const refresh = () => {
    const eraser = b.tool === 'eraser';
    root.querySelectorAll<HTMLElement>('.tool').forEach((t) => {
      const on = t.dataset.tool === b.tool;
      t.classList.toggle('bg-brand-500', on);
      t.classList.toggle('text-white', on);
      t.classList.toggle('text-slate-600', !on);
      t.classList.toggle('dark:text-slate-300', !on);
      t.setAttribute('aria-pressed', String(on));
    });
    root.querySelectorAll<HTMLElement>('.pen-color').forEach((t) => {
      const isCustom = t.classList.contains('pen-custom');
      const on = !eraser && (isCustom ? !!pen.custom && b.color === pen.custom : t.dataset.color === b.color);
      const dot = t.firstElementChild as HTMLElement;
      dot.classList.toggle('ring-2', on);
      dot.classList.toggle('ring-brand-500', on);
      dot.classList.toggle('ring-offset-2', on);
      dot.classList.toggle('ring-offset-transparent', on);
      t.classList.toggle('opacity-40', eraser);
    });
    const sizeEl = $<HTMLInputElement>('#dSize', root);
    sizeEl.disabled = eraser;
    sizeEl.classList.toggle('opacity-40', eraser);
    const dot = $('#dDot', root);
    const px = Math.min(36, Math.max(3, b.size * (b.tool === 'highlighter' ? HIGHLIGHTER_SCALE : 1) * 0.8));
    dot.style.width = dot.style.height = `${px}px`;
    dot.style.background = b.color === 'ink' ? 'currentColor' : b.color;
    dot.style.opacity = b.tool === 'highlighter' ? '0.5' : eraser ? '0.2' : '1';
    setDisabled($('#dUndo', root), !b.canUndo);
    setDisabled($('#dRedo', root), !b.canRedo);
  };

  const persist = () => {
    pen.tool = b.tool === 'eraser' ? 'pen' : b.tool;
    pen.color = b.color;
    pen.size = b.size;
    savePen(pen);
  };

  root.onclick = (e) => {
    if (st.board !== b) return;
    const t = e.target as HTMLElement;
    const tool = t.closest<HTMLElement>('.tool');
    const col = t.closest<HTMLElement>('.pen-color:not(.pen-custom)');
    if (t.closest('#dDone')) return endDrawing();
    if (tool) {
      b.tool = tool.dataset.tool as Tool;
      // المظلِّل بالحبر الأسود لا يُرى؛ نبدأه بأصفر مألوف
      if (b.tool === 'highlighter' && b.color === 'ink') b.color = '#facc15';
    } else if (col?.dataset.color) {
      b.color = col.dataset.color;
      if (b.tool === 'eraser') b.tool = 'pen';
    } else if (t.closest('#dUndo')) b.undo();
    else if (t.closest('#dRedo')) b.redo();
    else if (t.closest('#dClear')) {
      if (d.strokes.length && confirm('مسح الرسم كاملاً؟')) b.clear();
    }
    persist();
    refresh();
  };
  $<HTMLInputElement>('#dSize', root).oninput = (e) => {
    b.size = Number((e.target as HTMLInputElement).value);
    persist();
    refresh();
  };
  $<HTMLInputElement>('#dCustom', root).oninput = (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (!HEX.test(v)) return;
    pen.custom = v;
    b.color = v;
    if (b.tool === 'eraser') b.tool = 'pen';
    const sw = $('#dCustom', root).previousElementSibling as HTMLElement;
    sw.style.background = v;
    persist();
    refresh();
  };
  refresh();
}
