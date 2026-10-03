import { COLOR_IDS, COLOR_LABELS, type Attachment, type CheckItem, type ColorId, type Note } from './types';
import { deleteForever, isEmptyNote, saveNote, setStatus } from './db';
import { $, debounce, esc, uid } from './lib/util';
import { icon } from './lib/icons';
import { DrawingBoard, PEN_COLORS, PEN_SIZES, drawingPreviewSvg } from './lib/draw';
import { VoiceRecorder, pickFile, resizeImage } from './lib/media';
import { micState, needsMicIntro, showMicHelp, showMicIntro } from './lib/permission';
import { toast } from './lib/toast';

/** إجراء يُنفَّذ فور فتح ملاحظة جديدة (من الزر العائم). */
export type InitialAction = 'draw' | 'audio' | 'image';

/** يُستدعى بعد كل حفظ/حذف نهائي من المحرر ليحدّث الواجهة ويتحقق من النتيجة. */
let onSaved: (id: string, expectPresent: boolean) => void = () => {};
export function setOnSaved(fn: typeof onSaved): void {
  onSaved = fn;
}

let current: Note | null = null;
let dirty = false;
let closing = false;
let pop: 'add' | 'color' | null = null;

// وضع الرسم: يحل مؤقتاً محل محتوى الملاحظة
let drawingId: string | null = null;
let board: DrawingBoard | null = null;

// التسجيل الصوتي
let recorder: VoiceRecorder | null = null;
let recSec = 0;
let timerId: ReturnType<typeof setInterval> | undefined;

// روابط مؤقتة للوسائط المعروضة
let urls: string[] = [];
const blobUrl = (b: Blob): string => {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
};
const releaseUrls = () => {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
};

const save = debounce(async () => {
  if (current && dirty) {
    dirty = false;
    await saveNote(current);
  }
}, 400);

function touch() {
  dirty = true;
  save();
}


// ---------- تجربة الهاتف: لوحة المفاتيح وزر الرجوع ----------
/** يحافظ على المحرر داخل المساحة المرئية فوق لوحة المفاتيح (iOS لا يغيّر الـ layout viewport). */
function fitViewport() {
  const vv = window.visualViewport;
  const el = document.getElementById('editor');
  if (!vv || !el) return;
  const kb = window.innerHeight - vv.height - vv.offsetTop > 80 || vv.height < window.innerHeight - 120;
  el.classList.toggle('kb-open', kb);
  if (kb) {
    el.style.top = `${vv.offsetTop}px`;
    el.style.height = `${vv.height}px`;
    el.style.bottom = 'auto';
  } else {
    el.style.top = el.style.height = el.style.bottom = '';
  }
}
function trackViewport(on: boolean) {
  const vv = window.visualViewport;
  if (!vv) return;
  vv[on ? 'addEventListener' : 'removeEventListener']('resize', fitViewport);
  vv[on ? 'addEventListener' : 'removeEventListener']('scroll', fitViewport);
  const el = document.getElementById('editor');
  if (!on && el) {
    el.classList.remove('kb-open');
    el.style.top = el.style.height = el.style.bottom = '';
  } else fitViewport();
}

/** زر/إيماءة الرجوع في الهاتف يغلق المحرر بدل مغادرة التطبيق. */
let histPushed = false;
function pushHist() {
  try {
    history.pushState({ nawyNote: 'editor' }, '');
    histPushed = true;
  } catch { /* بيئة بلا history: نتجاهل */ }
}
function popHist() {
  if (!histPushed) return;
  histPushed = false;
  try { history.back(); } catch { /* ignore */ }
}
window.addEventListener('popstate', () => {
  if (histPushed) {
    histPushed = false; // المتصفح رجع بالفعل
    void closeEditor();
  }
});

export function isEditorOpen(): boolean {
  return current !== null;
}

/** حفظ فوري دون إغلاق (عند إخفاء الصفحة). */
export async function flushEditor(): Promise<void> {
  save.cancel();
  if (current && dirty && !isEmptyNote(current)) {
    dirty = false;
    await saveNote(current);
  }
}

/** isNew: ملاحظة جديدة لم تُحفظ بعد — تُهمَل إن بقيت فارغة. */
export function openEditor(note: Note, isNew: boolean, initial?: InitialAction): void {
  current = structuredClone(note);
  dirty = isNew;
  closing = false;
  pop = null;
  drawingId = null;

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
    if (pop && !(e.target as HTMLElement).closest('#ePop, #eAdd, #ePalette')) {
      pop = null;
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
  const n = current;
  if (!n || closing) return;
  closing = true;
  if (recorder) await stopRecording(true); // لا نُضيّع تسجيلاً جارياً
  save.cancel();
  board?.destroy();
  board = null;
  drawingId = null;
  clearInterval(timerId);
  releaseUrls();
  n.attachments = n.attachments.filter((a) => a.kind !== 'draw' || (a.drawing?.strokes.length ?? 0) > 0);
  current = null;

  if (isEmptyNote(n)) {
    await deleteForever(n.id); // لا يوجد شيء يُحفظ
    onSaved(n.id, false);
  } else if (dirty) {
    await saveNote(n);
    onSaved(n.id, true);
  }
  dirty = false;

  const el = $('#editor');
  el.classList.add('hidden');
  el.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
  trackViewport(false);
  popHist();
}

function applyColor(n: Note) {
  $('#editorCard').className =
    `modal-enter relative flex h-full w-full flex-col overflow-hidden border border-black/5 shadow-2xl dark:border-white/10 sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-2xl nc-${n.color}`;
}

function renderAll() {
  const n = current;
  if (!n) return;
  applyColor(n);
  if (drawingId) renderDrawMode(n);
  else renderNote(n);
}

// ============================================================
//  عرض الملاحظة
// ============================================================
function renderNote(n: Note) {
  $('#editorBody').onclick = null; // معالج وضع الرسم لا يجب أن يبقى بعد الخروج منه
  $('#editorBody').innerHTML = `
    <div id="eMedia"></div>
    <input id="eTitle" type="text" value="${esc(n.title)}" placeholder="العنوان"
      class="mb-3 w-full bg-transparent text-xl font-semibold outline-none placeholder:text-slate-400" />
    <div id="eContent"></div>`;
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

// ---------- نص ----------
function renderText(n: Note, root: HTMLElement) {
  root.innerHTML = `<textarea id="eText" rows="8" placeholder="اكتب ملاحظتك..."
    class="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-slate-400">${esc(n.body)}</textarea>`;
  const ta = $<HTMLTextAreaElement>('#eText', root);
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.max(150, ta.scrollHeight) + 'px';
  };
  ta.addEventListener('input', () => {
    n.body = ta.value;
    fit();
    touch();
  });
  queueMicrotask(fit);
}

// ---------- قائمة ----------
function renderList(n: Note, root: HTMLElement) {
  const row = (it: CheckItem) => `
    <div class="flex items-center gap-2" data-id="${it.id}">
      <input type="checkbox" class="h-4.5 w-4.5 shrink-0 accent-sky-500" ${it.done ? 'checked' : ''} aria-label="تم" />
      <input type="text" value="${esc(it.text)}" placeholder="عنصر"
        class="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-slate-400 ${it.done ? 'line-through opacity-50' : ''}" />
      <button type="button" class="rm btn-icon" aria-label="حذف العنصر">${icon('x', 'w-4 h-4')}</button>
    </div>`;
  const draw = () => {
    root.innerHTML = `<div class="space-y-1" id="rows">${n.items.map(row).join('')}</div>
      <button type="button" id="addItem" class="mt-2 flex items-center gap-2 text-sm text-slate-500 hover:text-sky-500">
        ${icon('plus', 'w-4 h-4')} إضافة عنصر</button>`;
  };
  draw();

  const find = (el: Element) => n.items.find((i) => i.id === el.closest<HTMLElement>('[data-id]')?.dataset.id);

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const it = find(t);
    if (!it) return;
    if (t.type === 'checkbox') {
      it.done = t.checked;
      t.nextElementSibling?.classList.toggle('line-through', it.done);
      t.nextElementSibling?.classList.toggle('opacity-50', it.done);
    } else it.text = t.value;
    touch();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#addItem')) {
      addItem();
    } else if (t.closest('.rm')) {
      const it = find(t);
      if (it) {
        n.items = n.items.filter((x) => x !== it);
        draw();
        touch();
      }
    }
  });
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLInputElement;
    if (e.key === 'Enter' && t.type === 'text' && !e.isComposing) {
      e.preventDefault();
      addItem(find(t));
    }
  });

  function addItem(after?: CheckItem) {
    const it: CheckItem = { id: uid(), text: '', done: false };
    const idx = after ? n.items.indexOf(after) + 1 : n.items.length;
    n.items.splice(idx, 0, it);
    draw();
    root.querySelector<HTMLInputElement>(`[data-id="${it.id}"] input[type=text]`)?.focus();
    touch();
  }
  if (!n.items.length) addItem();
}

/** نص <-> قائمة (كخيار "إظهار خانات الاختيار" في Keep). */
function toggleListMode() {
  const n = current;
  if (!n) return;
  if (n.type === 'text') {
    n.items = n.body
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ id: uid(), text, done: false }));
    n.body = '';
    n.type = 'list';
  } else {
    n.body = n.items.map((i) => i.text).filter((t) => t.trim()).join('\n');
    n.items = [];
    n.type = 'text';
  }
  touch();
  pop = null;
  renderNote(n);
}

// ============================================================
//  المرفقات: صور / رسوم / تسجيلات
// ============================================================
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const rmBtn = (id: string, cls = 'absolute end-2 top-2 bg-black/55 text-white') =>
  `<button type="button" data-rm="${id}" class="${cls} flex h-7 w-7 items-center justify-center rounded-full" aria-label="حذف">${icon('x', 'w-4 h-4')}</button>`;

function renderMedia() {
  const n = current;
  const root = document.getElementById('eMedia');
  if (!n || !root) return;
  releaseUrls();

  const imgs = n.attachments.filter((a) => a.kind === 'image' && a.blob);
  const draws = n.attachments.filter((a) => a.kind === 'draw');
  const audios = n.attachments.filter((a) => a.kind === 'audio' && a.blob);

  let html = '';
  if (imgs.length) {
    html += `<div class="grid gap-2 ${imgs.length > 1 ? 'grid-cols-2' : ''}">${imgs
      .map(
        (a) => `<div class="relative overflow-hidden rounded-xl">
          <img src="${blobUrl(a.blob!)}" alt="صورة مرفقة" class="max-h-[50dvh] w-full object-cover" />${rmBtn(a.id)}</div>`,
      )
      .join('')}</div>`;
  }
  for (const a of draws) {
    html += `<div class="relative overflow-hidden rounded-xl border border-black/10 p-2 dark:border-white/10">
      <button type="button" data-edit="${a.id}" class="block min-h-16 w-full text-slate-800 dark:text-slate-100" aria-label="تعديل الرسم">${a.drawing ? drawingPreviewSvg(a.drawing) : ''}</button>${rmBtn(a.id)}</div>`;
  }
  for (const a of audios) {
    html += `<div class="flex items-center gap-2">
      <audio controls preload="metadata" src="${blobUrl(a.blob!)}" class="h-10 min-w-0 flex-1"></audio>${rmBtn(a.id, 'btn-icon')}</div>`;
  }
  if (recorder) {
    html += `<div class="flex items-center gap-3 rounded-xl bg-red-500/10 px-3 py-2">
      <span class="h-3 w-3 animate-pulse rounded-full bg-red-500"></span>
      <span id="recTime" class="text-sm tabular-nums">${fmtTime(recSec)}</span>
      <span class="flex-1"></span>
      <button type="button" id="recCancel" class="text-sm text-slate-500 hover:text-red-500">إلغاء</button>
      <button type="button" id="recStop" class="btn-primary !py-1">حفظ</button></div>`;
  }

  root.className = html ? 'mb-4 space-y-3' : '';
  root.innerHTML = html;
  root.onclick = (e) => {
    const t = e.target as HTMLElement;
    const rm = t.closest<HTMLElement>('[data-rm]')?.dataset.rm;
    const ed = t.closest<HTMLElement>('[data-edit]')?.dataset.edit;
    if (rm && current) {
      current.attachments = current.attachments.filter((a) => a.id !== rm);
      touch();
      renderMedia();
    } else if (ed) startDrawing(ed);
    else if (t.closest('#recStop')) void stopRecording(true);
    else if (t.closest('#recCancel')) void stopRecording(false);
  };
}

function addAttachment(a: Attachment) {
  current?.attachments.push(a);
  touch();
}

// ---------- صورة ----------
async function addImage(fromInit = false) {
  const file = await pickFile('image/*');
  if (!file) {
    // ألغى المستخدم الاختيار من الزر العائم: لا نترك محرراً فارغاً
    if (fromInit && current && isEmptyNote(current)) void closeEditor();
    return;
  }
  try {
    const blob = await resizeImage(file);
    if (!current) return;
    addAttachment({ id: uid(), kind: 'image', blob, drawing: null });
    renderMedia();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'تعذّر فتح الصورة');
  }
}

// ---------- تسجيل صوتي ----------
/** بديل بلا إذن ميكروفون: مسجّل الجهاز نفسه (أو اختيار ملف صوتي). */
async function addDeviceRecording(capture: boolean) {
  const file = await pickFile('audio/*', capture);
  if (!file || !current) return;
  addAttachment({ id: uid(), kind: 'audio', blob: file, drawing: null });
  renderMedia();
}

function micHelp() {
  showMicHelp(() => void startRecording(), (capture) => void addDeviceRecording(capture)); // يبقى المحرر مفتوحاً
}

async function startRecording(skipIntro = false) {
  if (recorder || !current) return;
  if (!skipIntro) {
    const st = await micState();
    if (!current) return;
    if (st === 'denied') return micHelp(); // لا فائدة من الطلب: المتصفح سيرفضه فوراً
    if (needsMicIntro(st)) {
      showMicIntro(
        () => void startRecording(true),
        () => {
          if (current && isEmptyNote(current)) void closeEditor();
        },
      );
      return;
    }
  }
  const r = new VoiceRecorder();
  try {
    await r.start();
  } catch (err) {
    const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    if (denied) {
      micHelp();
      return;
    }
    toast(err instanceof Error ? err.message : 'تعذّر بدء التسجيل');
    if (current && isEmptyNote(current)) void closeEditor();
    return;
  }
  if (!current) return r.cancel(); // أُغلق المحرر أثناء طلب الإذن
  recorder = r;
  recSec = 0;
  timerId = setInterval(() => {
    recSec++;
    const el = document.getElementById('recTime');
    if (el) el.textContent = fmtTime(recSec);
  }, 1000);
  renderMedia();
}

async function stopRecording(keep: boolean) {
  const r = recorder;
  if (!r) return;
  recorder = null;
  clearInterval(timerId);
  if (keep) {
    try {
      const blob = await r.stop();
      if (current) addAttachment({ id: uid(), kind: 'audio', blob, drawing: null });
    } catch {
      toast('تعذّر إنهاء التسجيل');
    }
  } else r.cancel();
  renderMedia();
}

// ============================================================
//  وضع الرسم
// ============================================================
function startDrawing(id?: string) {
  const n = current;
  if (!n) return;
  let att = id ? n.attachments.find((a) => a.id === id) : undefined;
  if (!att) {
    att = { id: uid(), kind: 'draw', blob: null, drawing: { width: 800, height: 600, strokes: [] } };
    n.attachments.push(att);
  }
  drawingId = att.id;
  pop = null;
  renderAll();
}

function endDrawing() {
  const n = current;
  board?.destroy();
  board = null;
  if (n && drawingId) {
    const att = n.attachments.find((a) => a.id === drawingId);
    if (att && !att.drawing?.strokes.length) n.attachments = n.attachments.filter((a) => a !== att); // رسم فارغ
  }
  drawingId = null;
  renderAll();
}

function renderDrawMode(n: Note) {
  const att = n.attachments.find((a) => a.id === drawingId);
  if (!att?.drawing) {
    drawingId = null;
    return renderAll();
  }
  const d = att.drawing;
  const swatch = (c: string) =>
    `<button type="button" data-color="${c}" class="pen-color flex h-11 w-11 items-center justify-center" aria-label="لون القلم"><span class="block h-6 w-6 rounded-full border border-black/20" style="background:${c === 'ink' ? 'currentColor' : c}"></span></button>`;

  $('#editorFooter').style.display = 'none';
  const root = $('#editorBody');
  root.innerHTML = `
    <div class="mb-2 flex items-center justify-between">
      <span class="text-sm font-medium">رسم</span>
      <button type="button" id="dDone" class="btn-primary">تم</button>
    </div>
    <div class="mb-2 flex flex-wrap items-center">
      <button type="button" data-tool="pen" class="tool btn-icon" title="قلم">${icon('pencil')}</button>
      <button type="button" data-tool="eraser" class="tool btn-icon text-xs font-medium" title="ممحاة">ممحاة</button>
      <span class="mx-1 h-5 w-px bg-black/10 dark:bg-white/20"></span>
      ${PEN_COLORS.map(swatch).join('')}
      <span class="mx-1 h-5 w-px bg-black/10 dark:bg-white/20"></span>
      ${PEN_SIZES.map((s) => `<button type="button" data-size="${s}" class="pen-size flex h-11 w-11 items-center justify-center rounded-lg" aria-label="حجم القلم"><span class="rounded-full bg-current" style="width:${s + 2}px;height:${s + 2}px"></span></button>`).join('')}
      <span class="flex-1"></span>
      <button type="button" id="dUndo" class="btn-icon" title="تراجع">${icon('undo')}</button>
      <button type="button" id="dClear" class="btn-icon" title="مسح الكل">${icon('trash')}</button>
    </div>
    <div class="draw-surface overflow-hidden border border-black/10 dark:border-white/10">
      <canvas id="dCanvas" class="block h-auto w-full text-slate-900 dark:text-slate-100" style="aspect-ratio:${d.width}/${d.height}" dir="ltr"></canvas>
    </div>`;

  const b = new DrawingBoard($<HTMLCanvasElement>('#dCanvas', root), d, () => {
    touch();
    refresh();
  });
  board = b;

  const refresh = () => {
    root.querySelectorAll<HTMLElement>('.tool').forEach((t) => t.classList.toggle('active', t.dataset.tool === b.tool));
    root.querySelectorAll<HTMLElement>('.pen-color').forEach((t) => {
      const on = t.dataset.color === b.color && b.tool === 'pen';
      const dot = t.firstElementChild as HTMLElement;
      dot.classList.toggle('ring-2', on);
      dot.classList.toggle('ring-sky-500', on);
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
    if (board !== b) return;
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

// ============================================================
//  الشريط السفلي: + / اللون / تثبيت / أرشفة / حذف / تم
// ============================================================
function renderFooter() {
  const n = current;
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
      <button type="button" id="eAdd" class="btn-icon ${pop === 'add' ? 'active' : ''}" title="إضافة" aria-label="إضافة" aria-haspopup="menu" aria-expanded="${pop === 'add'}">${icon('plus')}</button>
      <button type="button" id="ePalette" class="btn-icon ${pop === 'color' ? 'active' : ''}" title="اللون" aria-label="اللون">${icon('palette')}</button>
    </div>
    <div class="flex items-center gap-1">
      <button type="button" id="ePin" class="btn-icon ${n.pinned ? 'active' : ''}" title="تثبيت" aria-label="تثبيت">${icon('pin')}</button>
      <button type="button" id="eArchive" class="btn-icon" title="${n.status === 'archived' ? 'إلغاء الأرشفة' : 'أرشفة'}" aria-label="أرشفة">${icon('archive')}</button>
      <button type="button" id="eTrash" class="btn-icon hover:!text-red-500" title="نقل للمهملات" aria-label="نقل للمهملات">${icon('trash')}</button>
      <button type="button" id="eDone" class="btn-primary ms-1">تم</button>
    </div>
    ${pop === 'add' ? addMenu : pop === 'color' ? colorMenu : ''}`;

  $('#eAdd', f).onclick = () => {
    pop = pop === 'add' ? null : 'add';
    renderFooter();
  };
  $('#ePalette', f).onclick = () => {
    pop = pop === 'color' ? null : 'color';
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
        pop = null;
        applyColor(n);
        renderFooter();
      } else if (add === 'list') toggleListMode();
      else if (add) {
        pop = null;
        renderFooter();
        if (add === 'image') void addImage();
        else if (add === 'audio') void startRecording();
        else if (add === 'draw') startDrawing();
      }
    };
  }

  $('#ePin', f).onclick = () => {
    n.pinned = !n.pinned;
    touch();
    renderFooter();
  };
  $('#eDone', f).onclick = () => void closeEditor();

  const leave = async (status: 'archived' | 'trashed' | 'active', msg: string) => {
    const id = n.id;
    n.status = status;
    dirty = true;
    await closeEditor();
    await setStatus(id, status);
    onSaved(id, true);
    toast(msg);
  };
  $('#eArchive', f).onclick = () =>
    void leave(
      n.status === 'archived' ? 'active' : 'archived',
      n.status === 'archived' ? 'أُعيدت من الأرشيف' : 'تمت الأرشفة',
    );
  $('#eTrash', f).onclick = () => void leave('trashed', 'نُقلت إلى المهملات');
}
