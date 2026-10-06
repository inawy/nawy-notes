import './style.css';
import { liveQuery, type Subscription } from 'dexie';
import Sortable from 'sortablejs';
import { registerSW } from 'virtual:pwa-register';
import type { Layout, Note, SortDir, SortMode, View } from './types';
import {
  db, deleteForever, getNote, emptyTrash, exportBackup, importBackup, listNotes, newNote, purgeOldTrash, reorderNotes, setStatus,
} from './db';
import { $, debounce, esc } from './lib/util';
import { icon } from './lib/icons';
import { drawingPreviewSvg } from './lib/draw';
import { toast } from './lib/toast';
import { appReady, dbMessage, reportError } from './lib/report';
import { createInstaller, IOS_HELP, type InstallState } from './pwa/install';
import { closeEditor, flushEditor, isEditorOpen, openEditor, setOnSaved } from './editor';
import { closeReader, isReaderOpen, openReader } from './reader';

let view: View = 'notes';
let query = '';
let sortMode: SortMode = 'manual';
let sortDir: SortDir = 'desc';
let layout: Layout = 'grid';
let sub: Subscription | undefined;
let cache = new Map<string, Note>();

const VIEW_ICON = { notes: 'notes', archive: 'archive', trash: 'trash' } as const;
const VIEW_LABEL: Record<View, string> = { notes: 'الملاحظات', archive: 'الأرشيف', trash: 'المهملات' };

// ---------- الواجهة الثابتة ----------
function mountChrome() {
  $('#btnMenu').innerHTML = icon('menu', 'w-6 h-6');
  $('#btnBackup').innerHTML = icon('download') + '<span>نسخ احتياطي</span>';
  $('#installIcon').innerHTML = icon('phone', 'w-5 h-5');
  $('#updateLater').innerHTML = icon('x', 'w-5 h-5');
  mountFab();
  syncToolbar();
  $('#emptyIcon').innerHTML = icon('notes', 'w-10 h-10');
  $('#tabs').innerHTML = (Object.keys(VIEW_LABEL) as View[])
    .map((v) => `<button type="button" class="tab" data-view="${v}">${icon(VIEW_ICON[v])}<span>${VIEW_LABEL[v]}</span></button>`)
    .join('');
  syncTheme();
}

// ---------- التفضيلات: الترتيب وطريقة العرض ----------
const PREFS_KEY = 'nawy-note:prefs'; // بادئة: الموقع يشاركه منتجات ناوي الأخرى

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
    if (p.sort === 'manual' || p.sort === 'created' || p.sort === 'updated') sortMode = p.sort;
    if (p.dir === 'asc' || p.dir === 'desc') sortDir = p.dir;
    if (p.layout === 'grid' || p.layout === 'list') layout = p.layout;
  } catch { /* التخزين محجوب أو تالف: نستخدم الافتراضي */ }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: sortMode, dir: sortDir, layout })); } catch { /* تجاهل */ }
}

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'manual', label: 'ترتيب يدوي (الافتراضي)' },
  { id: 'created', label: 'تاريخ الإنشاء' },
  { id: 'updated', label: 'تاريخ التعديل' },
];

function syncToolbar() {
  const toGrid = layout === 'list';
  const layoutBtn = $('#btnLayout');
  layoutBtn.title = toGrid ? 'عرض شبكة' : 'عرض قائمة';
  layoutBtn.innerHTML = icon(toGrid ? 'grid' : 'rows') + `<span>${layoutBtn.title}</span>`;
  layoutBtn.setAttribute('aria-label', layoutBtn.title);
  document.documentElement.dataset.layout = layout;

  const sortBtn = $('#btnSort');
  sortBtn.innerHTML = icon('sort');
  sortBtn.title = 'ترتيب';
  sortBtn.setAttribute('aria-label', 'ترتيب الملاحظات');
  sortBtn.classList.toggle('active', sortMode !== 'manual');
}

function renderSortMenu() {
  const check = (on: boolean) => `<span class="flex w-4 justify-center text-brand-500">${on ? icon('check', 'w-4 h-4', 3) : ''}</span>`;
  const dirs: { id: SortDir; label: string }[] = [
    { id: 'desc', label: 'الأحدث أولاً' },
    { id: 'asc', label: 'الأقدم أولاً' },
  ];
  $('#sortMenu').innerHTML =
    SORT_OPTIONS.map((o) => `<button type="button" role="menuitemradio" aria-checked="${sortMode === o.id}" data-sort="${o.id}" class="menu-item">${check(sortMode === o.id)}${o.label}</button>`).join('') +
    (sortMode === 'manual'
      ? `<p class="px-3 py-2 text-xs text-slate-400">اسحب البطاقات لإعادة ترتيبها.</p>`
      : `<div class="my-1 border-t border-slate-100 dark:border-slate-800"></div>` +
        dirs.map((d) => `<button type="button" role="menuitemradio" aria-checked="${sortDir === d.id}" data-dir="${d.id}" class="menu-item">${check(sortDir === d.id)}${d.label}</button>`).join('') +
        `<p class="px-3 py-2 text-xs text-slate-400">السحب لإعادة الترتيب متاح في الترتيب اليدوي فقط.</p>`);
}

function toggleSortMenu(open?: boolean) {
  const menu = $('#sortMenu');
  const on = open ?? menu.classList.contains('hidden');
  if (on) renderSortMenu();
  menu.classList.toggle('hidden', !on);
  $('#btnSort').setAttribute('aria-expanded', String(on));
}

function syncTheme() {
  const dark = document.documentElement.classList.contains('dark');
  $('#btnTheme').innerHTML = icon(dark ? 'sun' : 'moon') + `<span>${dark ? 'الوضع النهاري' : 'الوضع الليلي'}</span>`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#020617' : '#f8fafc'); // لون الهيدر، فيمتزج شريط الحالة معه
}

// ---------- البطاقات ----------
let urls: string[] = [];
function blobUrl(b: Blob): string {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
}

/** ملخّص سطر واحد/سطرين لعرض الصفوف. */
function summaryOf(n: Note): string {
  if (n.type === 'list') {
    const done = n.items.filter((i) => i.done).length;
    return n.items.length ? `${n.items.length} عناصر، تمّ منها ${done}` : '';
  }
  return n.body.trim().slice(0, 100);
}

function cardHTML(n: Note): string {
  const trash = view === 'trash';
  const imgs = n.attachments.filter((a) => a.kind === 'image' && a.blob);
  const draws = n.attachments.filter((a) => a.kind === 'draw' && a.drawing?.strokes.length);
  const audios = n.attachments.filter((a) => a.kind === 'audio' && a.blob);
  const base = `note-card nc-${n.color} cursor-pointer overflow-hidden rounded-[18px] border border-black/[0.07] dark:border-white/10`;

  const actions = trash
    ? `<div class="flex shrink-0 gap-1 border-t border-black/5 px-2 dark:border-white/10">
         <button type="button" data-act="restore" class="flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-brand-600 dark:text-brand-300">${icon('restore', 'w-4 h-4')} استعادة</button>
         <button type="button" data-act="purge" class="ms-auto flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-red-500">${icon('trash', 'w-4 h-4')} حذف نهائي</button>
       </div>`
    : '';

  // ---- عرض الصفوف: ارتفاع ثابت، صورة مصغّرة ثم العنوان والوصف ----
  if (layout === 'list') {
    let thumb = icon(n.type === 'list' ? 'list' : 'notes', 'w-6 h-6');
    let fallback = summaryOf(n);
    if (imgs.length) {
      thumb = `<img src="${blobUrl(imgs[0].blob!)}" alt="" loading="lazy" class="h-full w-full object-cover" />`;
      fallback ||= 'صورة';
    } else if (draws.length) {
      thumb = `<div class="h-full w-full p-1 text-slate-800 [&>svg]:h-full [&>svg]:w-full dark:text-slate-100">${drawingPreviewSvg(draws[0].drawing!)}</div>`;
      fallback ||= 'رسم';
    } else if (audios.length) {
      thumb = icon('mic', 'w-6 h-6');
      fallback ||= 'تسجيل صوتي';
    }
    return `<article class="${base} flex ${trash ? 'min-h-[84px] flex-col' : 'h-[84px] items-center gap-3 p-2.5'}" data-id="${n.id}" ${trash ? '' : 'tabindex="0"'}>
      <div class="${trash ? 'flex flex-1 items-center gap-3 p-2.5' : 'contents'}">
        <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/70 text-slate-500 dark:bg-black/20 dark:text-slate-300">${thumb}</div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-[15px] font-semibold">${n.pinned ? '📌 ' : ''}${esc(n.title || fallback || 'ملاحظة')}</h3>
          ${n.title && fallback ? `<p class="clamp-2 mt-0.5 break-words text-[12.5px] leading-snug opacity-70">${esc(fallback)}</p>` : ''}
        </div>
      </div>${actions}
    </article>`;
  }

  // ---- عرض الشبكة: بطاقات مربّعة متقاربة الحجم ----
  const chip = (name: Parameters<typeof icon>[0], label = '') =>
    `<span class="inline-flex items-center gap-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[11px] dark:bg-white/10">${icon(name, 'w-3.5 h-3.5')}${label}</span>`;
  const cover = imgs.length ? 'img' : draws.length ? 'draw' : '';
  const chips: string[] = [];
  if (audios.length) chips.push(chip('mic', audios.length > 1 ? String(audios.length) : ''));
  if (imgs.length > 1) chips.push(chip('image', `+${imgs.length - 1}`));
  const extraDraws = cover === 'img' ? draws.length : draws.length - 1;
  if (extraDraws > 0) chips.push(chip('pencil', String(extraDraws)));
  const chipRow = chips.length ? `<div class="absolute bottom-2 start-3 z-[1] flex gap-1">${chips.join('')}</div>` : '';
  const pin = n.pinned ? `<span class="absolute end-2 top-2 z-[1] text-[11px] opacity-60">📌</span>` : '';

  let inner: string;
  if (cover) {
    const layer =
      cover === 'img'
        ? `<img src="${blobUrl(imgs[0].blob!)}" alt="${esc(n.title || 'صورة')}" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />`
        : `<div class="absolute inset-0 flex items-center justify-center p-3 pb-10 text-slate-800 dark:text-slate-100 [&>svg]:max-h-full [&>svg]:w-full">${drawingPreviewSvg(draws[0].drawing!)}</div>`;
    const dark = cover === 'img';
    const cap = n.title || (cover === 'draw' ? 'رسم' : '');
    inner = `${layer}${
      cap
        ? `<div class="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-3 pb-2 pt-7 text-[13px] font-semibold ${
            dark ? 'bg-gradient-to-t from-black/60 to-transparent text-white' : 'card-fade'
          }"><span class="truncate">${esc(cap)}</span></div>`
        : ''
    }${dark && chips.length ? '' : chipRow}`;
  } else {
    let content = '';
    if (n.type === 'text') {
      if (n.body) content = `<p class="clamp-5 whitespace-pre-wrap break-words text-[13px] leading-[1.65] opacity-80">${esc(n.body.slice(0, 260))}</p>`;
    } else {
      const all = n.items.filter((i) => i.text.trim());
      const shown = all.slice(0, 4);
      const more = all.length - shown.length;
      content =
        `<ul class="text-[13px]">` +
        shown
          .map(
            (i) => `<li class="flex h-[26px] items-center gap-2 ${i.done ? 'line-through opacity-50' : 'opacity-85'}">
            <span class="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border-[1.6px] border-current">${i.done ? icon('check', 'w-2.5 h-2.5', 3.5) : ''}</span>
            <span class="truncate">${esc(i.text)}</span></li>`,
          )
          .join('') +
        (more > 0 ? `<li class="mt-0.5 text-[11px] opacity-60">+ ${more} عناصر أخرى</li>` : '') +
        `</ul>`;
    }
    if (!content && !n.title && audios.length) content = `<div class="mt-6 flex justify-center opacity-70">${icon('mic', 'w-10 h-10', 1.6)}</div>`;
    inner = `<div class="p-3 ${n.pinned ? 'pe-7' : ''}">${
      n.title ? `<h3 class="clamp-2 mb-1 break-words text-[15px] font-semibold leading-snug">${esc(n.title)}</h3>` : ''
    }${content}</div><div class="card-fade pointer-events-none absolute inset-x-0 bottom-0 h-9"></div>${chipRow}`;
  }

  return `<article class="${base} relative flex aspect-square flex-col" data-id="${n.id}" ${trash ? '' : 'tabindex="0"'}>
    <div class="relative min-h-0 flex-1 overflow-hidden">${pin}${inner}</div>${actions}
  </article>`;
}

function render(notes: Note[]) {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  cache = new Map(notes.map((n) => [n.id, n]));
  const pinned = view === 'notes' ? notes.filter((n) => n.pinned) : [];
  const others = view === 'notes' ? notes.filter((n) => !n.pinned) : notes;

  $('#pinnedSection').classList.toggle('hidden', !pinned.length);
  $('#pinnedGrid').innerHTML = pinned.map(cardHTML).join('');
  $('#othersTitle').classList.toggle('hidden', !(pinned.length && others.length));
  $('#grid').innerHTML = others.map(cardHTML).join('');

  const empty = !notes.length;
  const e = $('#empty');
  e.classList.toggle('hidden', !empty);
  e.classList.toggle('flex', empty);
  $('#emptyText').textContent = query
    ? 'لا نتائج مطابقة'
    : { notes: 'لا توجد ملاحظات بعد', archive: 'الأرشيف فارغ', trash: 'المهملات فارغة' }[view];

  $('#fabRoot').classList.toggle('hidden', view !== 'notes');
  if (view !== 'notes') toggleFab(false);
  const showTrashBar = view === 'trash' && !empty;
  $('#trashBar').classList.toggle('hidden', !showTrashBar);
  $('#trashBar').classList.toggle('flex', showTrashBar);
  document.querySelectorAll<HTMLElement>('#tabs .tab').forEach((t) => {
    if (t.dataset.view === view) {
      t.setAttribute('aria-current', 'page');
    } else t.removeAttribute('aria-current');
  });
  mountSortables();
  if (enterPending) {
    enterPending = false;
    window.scrollTo(0, 0); // العرض الجديد يبدأ من أعلاه بدل قفزة في موضع التمرير
    const m = document.querySelector('main')!;
    m.classList.remove('view-enter');
    void m.offsetWidth;
    m.classList.add('view-enter');
  }
}

// ---------- ترتيب بالسحب والإفلات ----------
let sortables: Sortable[] = [];
let dragging = false;

function mountSortables() {
  sortables.forEach((s) => s.destroy());
  sortables = [];
  if (view === 'trash' || sortMode !== 'manual') return; // السحب فقط في الترتيب اليدوي
  for (const sel of ['#pinnedGrid', '#grid']) {
    const el = $(sel);
    if (!el.children.length) continue;
    sortables.push(
      Sortable.create(el, {
        animation: 150,
        delay: 220, // على اللمس: ضغطة مطوّلة للسحب حتى لا يتعارض مع التمرير
        delayOnTouchOnly: true,
        touchStartThreshold: 6,
        filter: 'audio, button, input, textarea, a',
        preventOnFilter: false,
        chosenClass: 'drag-chosen',
        ghostClass: 'drag-ghost',
        onStart: () => {
          dragging = true;
        },
        onEnd: (evt: { oldIndex?: number; newIndex?: number }) => {
          setTimeout(() => (dragging = false), 80); // يمنع نقرة "الإفلات" من فتح المحرر
          if (evt.oldIndex === evt.newIndex) return;
          const ids = [...el.querySelectorAll<HTMLElement>(':scope > .note-card')].map((c) => c.dataset.id!);
          void reorderNotes(ids).then(refreshNow);
        },
      }),
    );
  }
}

// ---------- الاشتراك الحي ----------
function subscribe() {
  sub?.unsubscribe();
  const v = view;
  const q = query;
  const sm = sortMode;
  const sd = sortDir;
  sub = liveQuery(() => listNotes(v, q, sm, sd)).subscribe({
    next: render,
    error: (err) => reportError(dbMessage(err)),
  });
}

// ---------- تحديث يدوي + فحص ذاتي ----------
const VIEW_STATUS: Record<View, string> = { notes: 'active', archive: 'archived', trash: 'trashed' };

/** تحديث فوري للقائمة دون الاعتماد على liveQuery (شبكة أمان). */
async function refreshNow() {
  try {
    render(await listNotes(view, query, sortMode, sortDir));
  } catch (err) {
    reportError(dbMessage(err));
  }
}

/** بعد كل حفظ: حدّث القائمة ثم تحقق أن النتيجة ظاهرة، وإلا أخبر المستخدم أي طبقة فشلت. */
async function afterSave(id: string, expectPresent: boolean) {
  await refreshNow();
  try {
    const n = await getNote(id);
    if (expectPresent && !n) {
      return reportError('الحفظ لم يُسجَّل في قاعدة البيانات رغم عدم ظهور خطأ. جرّب متصفحاً آخر أو افتح التطبيق عبر https/localhost.');
    }
    const visible = n && n.status === VIEW_STATUS[view] && !query;
    if (visible && !document.querySelector(`.note-card[data-id="${id}"]`)) {
      reportError(`حُفظت الملاحظة (الحالة: ${n.status}) لكنها لم تظهر في القائمة (العرض: ${view}).`);
    }
  } catch (err) {
    reportError(dbMessage(err));
  }
}

// ---------- الأحداث ----------
type FabAction = 'text' | 'list' | 'draw' | 'audio' | 'image';
const FAB_ITEMS: { type: FabAction; label: string; icon: Parameters<typeof icon>[0] }[] = [
  { type: 'text', label: 'نص', icon: 'notes' },
  { type: 'list', label: 'قائمة', icon: 'list' },
  { type: 'draw', label: 'رسم', icon: 'pencil' },
  { type: 'audio', label: 'صوت', icon: 'mic' },
  { type: 'image', label: 'صورة', icon: 'image' },
];

function mountFab() {
  $('#fab').innerHTML = `<span id="fabIcon" class="transition-transform duration-200">${icon('plus', 'w-7 h-7', 2.5)}</span>`;
  $('#fabMenu').innerHTML = FAB_ITEMS.map(
    (i) => `<button type="button" data-type="${i.type}" class="flex items-center gap-3">
      <span class="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-800">${i.label}</span>
      <span class="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:text-brand-300">${icon(i.icon)}</span>
    </button>`,
  ).join('');
}

function toggleFab(open?: boolean) {
  const menu = $('#fabMenu');
  const on = open ?? menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !on);
  menu.classList.toggle('flex', on);
  if (on) menu.classList.add('modal-enter');
  $('#fabBackdrop').classList.toggle('hidden', !on);
  $('#fab').setAttribute('aria-expanded', String(on));
  $('#fabIcon').style.transform = on ? 'rotate(45deg)' : '';
}

function create(type: FabAction) {
  toggleFab(false);
  // يجب أن تبقى الاستدعاءات متزامنة مع النقرة (إذن الميكروفون ونافذة اختيار الصور)
  if (type === 'text' || type === 'list') openEditor(newNote(type), true);
  else openEditor(newNote('text'), true, type);
}

const VIEW_ORDER: View[] = ['notes', 'archive', 'trash'];
let enterPending = false;

function setView(v: View) {
  if (v !== view) enterPending = true; // الحركة تُشغَّل عند وصول محتوى العرض الجديد، لا قبله
  view = v;
  if (v !== 'notes') $<HTMLInputElement>('#search').value = '';
  query = '';
  subscribe();
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function wire() {
  $('#btnSort').onclick = (e) => {
    e.stopPropagation();
    toggleSortMenu();
  };
  $('#sortMenu').onclick = (e) => {
    e.stopPropagation(); // إعادة رسم القائمة تفصل الهدف فلا يجب أن يغلقها مستمع النقر العام
    const el = e.target as HTMLElement;
    const s = el.closest<HTMLElement>('[data-sort]')?.dataset.sort as SortMode | undefined;
    const d = el.closest<HTMLElement>('[data-dir]')?.dataset.dir as SortDir | undefined;
    if (s) sortMode = s;
    else if (d) sortDir = d;
    else return;
    savePrefs();
    syncToolbar();
    subscribe();
    if (s) toggleSortMenu(false);
    else renderSortMenu();
  };
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('#sortMenu')) toggleSortMenu(false);
  });
  $('#btnLayout').onclick = () => {
    layout = layout === 'grid' ? 'list' : 'grid';
    savePrefs();
    syncToolbar();
    void refreshNow();
  };

  $('#fab').onclick = () => toggleFab();
  $('#fabBackdrop').onclick = () => toggleFab(false);
  $('#fabMenu').onclick = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-type]')?.dataset.type as FabAction | undefined;
    if (t) create(t);
  };

  // سحب أفقي للتنقل بين التبويبات (RTL: السحب نحو اليمين = التبويب التالي)
  let sx = 0, sy = 0, st = 0, tracking = false;
  const main = document.querySelector('main')!;
  main.addEventListener('touchstart', (e) => {
    tracking = e.touches.length === 1 && !isEditorOpen() && !isReaderOpen() && !document.querySelector('.drag-chosen');
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - st > 700) return;
    if (document.querySelector('.drag-chosen')) return;
    const i = VIEW_ORDER.indexOf(view) + (dx > 0 ? 1 : -1);
    if (i >= 0 && i < VIEW_ORDER.length) setView(VIEW_ORDER[i]);
  }, { passive: true });

  // قائمة المتصفح السياقية (نسخ/مشاركة) لا مكان لها في التطبيق إلا داخل حقول الكتابة
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
  });
  const drawer = (on: boolean) => {
    $('#drawerRoot').classList.toggle('hidden', !on);
    $('#btnMenu').setAttribute('aria-expanded', String(on));
  };
  $('#btnMenu').onclick = () => { toggleSortMenu(false); drawer(true); };
  $('#drawerBackdrop').onclick = () => drawer(false);
  // سويب نحو حافة القائمة (اليمين في العربية) يغلقها
  let dsx = 0, dsy = 0;
  const root = $('#drawerRoot');
  root.addEventListener('touchstart', (e) => { dsx = e.touches[0].clientX; dsy = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - dsx;
    const dy = e.changedTouches[0].clientY - dsy;
    const towardEdge = getComputedStyle(document.documentElement).direction === 'rtl' ? dx : -dx;
    if (towardEdge > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) drawer(false);
  }, { passive: true });
  $('#drawer').addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) drawer(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false); });
  $('#tabs').onclick = (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('[data-view]')?.dataset.view as View | undefined;
    if (v) setView(v);
  };

  $('#btnTheme').onclick = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('nawy-note:theme', dark ? 'dark' : 'light'); } catch { /* التخزين محجوب */ }
    syncTheme();
  };

  $<HTMLInputElement>('#search').addEventListener(
    'input',
    debounce((e: Event) => {
      query = (e.target as HTMLInputElement).value;
      subscribe();
    }, 180),
  );

  const read = async (id: string) => {
    const n = (await getNote(id)) ?? cache.get(id);
    if (n) openReader(n, (x) => openEditor(x, false));
  };
  const onGrid = async (e: Event) => {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('.note-card');
    if (!card || dragging || t.closest('audio')) return;
    const id = card.dataset.id!;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'restore') {
      await setStatus(id, 'active');
      toast('تمت الاستعادة');
      void refreshNow();
    } else if (act === 'purge') {
      if (confirm('حذف الملاحظة نهائياً؟')) {
        await deleteForever(id);
        void refreshNow();
      }
    } else if (view !== 'trash') await read(id);
  };
  for (const id of ['#grid', '#pinnedGrid']) {
    $(id).addEventListener('click', onGrid);
    $(id).addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void onGrid(e);
    });
  }

  $('#btnEmptyTrash').onclick = async () => {
    if (confirm('إفراغ المهملات نهائياً؟')) {
      await emptyTrash();
      toast('أُفرغت المهملات');
      void refreshNow();
    }
  };

  // نسخ احتياطي: زر واحد يصدّر، ونقر مع Shift يستورد (وقائمة صغيرة عبر confirm للبساطة)
  const file = $<HTMLInputElement>('#importFile');
  $('#btnBackup').onclick = () => {
    if (confirm('موافق = تصدير نسخة احتياطية\nإلغاء = استيراد نسخة من ملف')) {
      void doBackup();
    } else file.click();
  };
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const n = await importBackup(await f.text());
      toast(`تم استيراد ${n} ملاحظة`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'فشل الاستيراد');
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isEditorOpen()) void closeEditor();
      else if (isReaderOpen()) closeReader();
      else {
        toggleFab(false);
        toggleSortMenu(false);
      }
    }
    if (e.key === '/' && !isEditorOpen() && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      $('#search').focus();
    }
  });

  // أمان إضافي: احفظ ما في المحرر عند إخفاء الصفحة
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isEditorOpen()) void flushEditor();
  });
}

// ---------- البدء ----------
db.on('blocked', () => reportError('هناك نافذة أخرى من التطبيق مفتوحة بنسخة قديمة. أغلقها ثم حدّث هذه الصفحة.'));
db.open().catch((err) => reportError(dbMessage(err)));
setOnSaved((id, expectPresent) => void afterSave(id, expectPresent));
loadPrefs();
mountChrome();
wire();
subscribe();
void purgeOldTrash();

// ---------- تثبيت التطبيق (PWA) ----------
const installer = createInstaller(window, (st: InstallState) => {
  $('#btnInstall').hidden = st === 'hidden';
});
installer.refresh();
$('#btnInstall').onclick = async () => {
  const r = await installer.install();
  if (r === 'ios-help') toast(IOS_HELP);
  else if (r === 'accepted') toast('جارٍ تثبيت ناوي نوت…');
};

// ---------- التحديث: لا نعيد التحميل وسط الكتابة، المستخدم يقرر ----------
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => ($('#updateBar').hidden = false),
  onOfflineReady: () => toast('جاهز للعمل بدون إنترنت'),
});
$('#updateNow').onclick = async () => {
  await flushEditor(); // لا يضيع شيء مما يُكتب
  await updateSW(true);
};
$('#updateLater').onclick = () => (($('#updateBar').hidden = true));

// تخزين دائم: يمنع المتصفح من مسح البيانات تحت ضغط المساحة
void navigator.storage?.persist?.();

// ---------- النسخ الاحتياطي + تذكير هادئ ----------
const BK_LAST = 'nawy-note:last-backup';
const BK_ASKED = 'nawy-note:backup-asked';
const DAY = 86_400_000;
async function doBackup() {
  const b = await exportBackup();
  download(b, `nawy-note-${new Date().toISOString().slice(0, 10)}.json`);
  try { localStorage.setItem(BK_LAST, String(Date.now())); } catch { /* تجاهل */ }
}
/** البيانات محلية فقط؛ نذكّر مرة كل أسبوعين كحدّ أقصى إن مضى 30 يوماً بلا نسخة. */
async function maybeRemindBackup() {
  try {
    const now = Date.now();
    if (!localStorage.getItem(BK_ASKED)) { localStorage.setItem(BK_ASKED, String(now)); return; } // أول استخدام: ابدأ العدّ
    const last = Number(localStorage.getItem(BK_LAST) ?? localStorage.getItem(BK_ASKED));
    const asked = Number(localStorage.getItem(BK_ASKED));
    if (now - last < 30 * DAY || now - asked < 14 * DAY) return;
    if ((await db.notes.toArray()).length < 3) return;
    localStorage.setItem(BK_ASKED, String(now));
    toast('ملاحظاتك محفوظة على هذا الجهاز فقط. خذ نسخة احتياطية؟', { label: 'نسخ الآن', run: () => void doBackup() });
  } catch { /* تجاهل */ }
}
setTimeout(() => void maybeRemindBackup(), 4000);

// ---------- نقاط الدخول: اختصارات الأيقونة والمشاركة من تطبيقات أخرى ----------
function handleLaunchIntent() {
  const q = new URLSearchParams(location.search);
  const kind = q.get('new');
  const shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean) as string[];
  if (!kind && !shared.length) return;
  history.replaceState(null, '', location.pathname + location.hash); // لا يتكرر عند التحديث
  if (shared.length) {
    const note = newNote('text');
    note.title = shared.length > 1 ? shared[0] : '';
    note.body = shared.slice(shared.length > 1 ? 1 : 0).join('\n');
    openEditor(note, true);
  } else if (kind === 'text' || kind === 'list') openEditor(newNote(kind), true);
  else if (kind === 'audio' || kind === 'draw') openEditor(newNote('text'), true, kind);
}
handleLaunchIntent();

appReady();
