import './style.css';
import { liveQuery, type Subscription } from 'dexie';
import Sortable from 'sortablejs';
import type { Layout, Note, SortDir, SortMode, View } from './types';
import {
  db,
  deleteForever,
  getNote,
  emptyTrash,
  listNotes,
  newNote,
  purgeOldTrash,
  reorderNotes,
  setStatus,
} from './db';
import { $, countNotes, debounce } from './lib/util';
import { icon } from './lib/icons';
import { toast } from './lib/toast';
import { html } from './lib/html';
import { appReady, dbMessage, reportError } from './lib/report';
import { closeEditor, flushEditor, isEditorOpen, openEditor, setOnSaved } from './editor';
import { cardHTML } from './views/card';
import { mountBackup } from './features/backup';
import { mountDrawer } from './features/drawer';
import { handleLaunchIntent } from './features/launch';
import { mountPwa } from './features/pwa';
import { mountTabSwipe } from './features/tab-swipe';
import { mountTheme, syncTheme } from './features/theme';
import { preventNativeMenu } from './lib/app-feel';
import { closeReader, isReaderOpen, openReader } from './reader';

let view: View = 'notes';
let query = '';
let sortMode: SortMode = 'manual';
let sortDir: SortDir = 'desc';
let layout: Layout = 'grid';
let sub: Subscription | undefined;
let cache = new Map<string, Note>();
let firstRender = false;

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
    .map(
      (v) =>
        `<button type="button" class="tab" data-view="${v}">${icon(VIEW_ICON[v])}<span>${VIEW_LABEL[v]}</span></button>`,
    )
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
  } catch {
    /* التخزين محجوب أو تالف: نستخدم الافتراضي */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: sortMode, dir: sortDir, layout }));
  } catch {
    /* تجاهل */
  }
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
  layoutBtn.innerHTML = icon(toGrid ? 'grid' : 'rows');
  layoutBtn.setAttribute('aria-label', layoutBtn.title);
  document.documentElement.dataset.layout = layout;

  const sortBtn = $('#btnSort');
  sortBtn.innerHTML = icon('sort');
  sortBtn.title = 'ترتيب';
  sortBtn.setAttribute('aria-label', 'ترتيب الملاحظات');
  sortBtn.classList.toggle('active', sortMode !== 'manual');
}

function renderSortMenu() {
  const check = (on: boolean) =>
    `<span class="flex w-4 justify-center text-brand-500">${on ? icon('check', 'w-4 h-4', 3) : ''}</span>`;
  const dirs: { id: SortDir; label: string }[] = [
    { id: 'desc', label: 'الأحدث أولاً' },
    { id: 'asc', label: 'الأقدم أولاً' },
  ];
  $('#sortMenu').innerHTML =
    SORT_OPTIONS.map(
      (o) =>
        `<button type="button" role="menuitemradio" aria-checked="${sortMode === o.id}" data-sort="${o.id}" class="menu-item">${check(sortMode === o.id)}${o.label}</button>`,
    ).join('') +
    (sortMode === 'manual'
      ? `<p class="px-3 py-2 text-xs text-slate-400">اسحب البطاقات لإعادة ترتيبها.</p>`
      : `<div class="my-1 border-t border-slate-100 dark:border-slate-800"></div>` +
        dirs
          .map(
            (d) =>
              `<button type="button" role="menuitemradio" aria-checked="${sortDir === d.id}" data-dir="${d.id}" class="menu-item">${check(sortDir === d.id)}${d.label}</button>`,
          )
          .join('') +
        `<p class="px-3 py-2 text-xs text-slate-400">السحب لإعادة الترتيب متاح في الترتيب اليدوي فقط.</p>`);
}

function toggleSortMenu(open?: boolean) {
  const menu = $('#sortMenu');
  const on = open ?? menu.classList.contains('hidden');
  if (on) renderSortMenu();
  menu.classList.toggle('hidden', !on);
  $('#btnSort').setAttribute('aria-expanded', String(on));
}

// ---------- البطاقات ----------
let urls: string[] = [];
function blobUrl(b: Blob): string {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
}

/** بطاقة واحدة معطوبة (بيانات غير متوقعة) لا يجوز أن تُفرغ الشاشة كلها: نعرض بديلاً بسيطاً. */
const card = (n: Note): string => {
  try {
    return cardHTML(n, { trash: view === 'trash', layout, blobUrl });
  } catch (err) {
    console.error('تعذّر رسم ملاحظة', n.id, err);
    return String(
      html`<article class="note-card nc-default cursor-pointer overflow-hidden rounded-[18px] border border-black/[0.07] p-3 dark:border-white/10" data-id="${n.id}" tabindex="0"><h3 class="truncate text-[15px] font-semibold">${n.title || 'ملاحظة'}</h3><p class="mt-1 text-xs opacity-60">تعذّر عرض محتواها</p></article>`,
    );
  }
};

function render(notes: Note[]) {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  cache = new Map(notes.map((n) => [n.id, n]));
  const pinned = view === 'notes' ? notes.filter((n) => n.pinned) : [];
  const others = view === 'notes' ? notes.filter((n) => !n.pinned) : notes;

  $('#pinnedSection').classList.toggle('hidden', !pinned.length);
  $('#pinnedGrid').innerHTML = pinned.map(card).join('');
  $('#othersTitle').classList.toggle('hidden', !(pinned.length && others.length));
  $('#grid').innerHTML = others.map(card).join('');

  const empty = !notes.length;
  const e = $('#empty');
  e.classList.toggle('hidden', !empty);
  e.classList.toggle('flex', empty);
  $('#emptyIcon').innerHTML = icon(query ? 'search' : VIEW_ICON[view], 'w-10 h-10');
  $('#emptyText').textContent = query
    ? 'لا نتائج مطابقة'
    : { notes: 'لا توجد ملاحظات بعد', archive: 'الأرشيف فارغ', trash: 'المهملات فارغة' }[view];

  $('#fabRoot').classList.toggle('hidden', view !== 'notes');
  if (view !== 'notes') toggleFab(false);
  renderViewHeader(notes.length);
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

// ---------- ترويسة القسم (الأرشيف/المهملات) ----------
const VIEW_HINT: Record<View, string> = {
  notes: '',
  archive: 'ملاحظات محفوظة بعيداً عن الشاشة الرئيسية',
  trash: 'تُحذف نهائياً بعد 30 يوماً',
};

function renderViewHeader(count: number) {
  const h = $('#viewHeader');
  const show = view !== 'notes';
  h.classList.toggle('hidden', !show);
  h.classList.toggle('flex', show);
  $('#vhHint').classList.toggle('hidden', !show || !!query);
  if (!show) return;
  $('#vhHint').textContent = VIEW_HINT[view];
  const trash = view === 'trash';
  $('#vhIcon').innerHTML = icon(VIEW_ICON[view], 'w-6 h-6');
  $('#vhIcon').className =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ' +
    (trash
      ? 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400'
      : 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300');
  $('#vhTitle').textContent = VIEW_LABEL[view];
  $('#vhSub').textContent = query ? (count ? `${countNotes(count)} مطابقة` : 'لا نتائج مطابقة') : countNotes(count);
  const btn = $('#btnEmptyTrash');
  const canEmpty = trash && count > 0 && !query;
  btn.classList.toggle('hidden', !canEmpty);
  btn.classList.toggle('inline-flex', canEmpty);
  btn.innerHTML = icon('trash', 'w-4 h-4') + '<span>إفراغ</span>';
  // نقاط التنقّل: تُلمّح أن بين الأقسام سويباً جانبياً
  $('#vhDots').innerHTML = VIEW_ORDER.map(
    (v) =>
      `<span class="h-1.5 rounded-full transition-all ${
        v === view ? 'w-4 bg-brand-500' : 'w-1.5 bg-slate-300 dark:bg-slate-600'
      }"></span>`,
  ).join('');
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
        animation: 180,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        delay: 130, // على اللمس: ضغطة قصيرة للسحب حتى لا يتعارض مع التمرير
        delayOnTouchOnly: true,
        touchStartThreshold: 12, // يسمح بارتجاف الإصبع قبل أن تبدأ الضغطة
        fallbackTolerance: 3,
        swapThreshold: 0.5,
        filter: 'audio, button, input, textarea, a',
        preventOnFilter: false,
        chosenClass: 'drag-chosen',
        ghostClass: 'drag-ghost',
        onStart: () => {
          dragging = true;
          try {
            navigator.vibrate?.(8);
          } catch {
            /* غير مدعوم */
          }
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
    next: (notes) => {
      firstRender = true;
      try {
        render(notes);
      } catch (err) {
        reportError(`تعذّر رسم القائمة: ${(err as Error)?.message ?? err}`);
      }
    },
    error: (err) => reportError(dbMessage(err)),
  });
}

// ---------- تحديث يدوي + فحص ذاتي ----------
const VIEW_STATUS: Record<View, string> = { notes: 'active', archive: 'archived', trash: 'trashed' };

/** تحديث فوري للقائمة دون الاعتماد على liveQuery (شبكة أمان). */
async function refreshNow() {
  try {
    render(await listNotes(view, query, sortMode, sortDir));
    firstRender = true;
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
      return reportError(
        'الحفظ لم يُسجَّل في قاعدة البيانات رغم عدم ظهور خطأ. جرّب متصفحاً آخر أو افتح التطبيق عبر https/localhost.',
      );
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
  $('#fab').innerHTML =
    `<span id="fabIcon" class="transition-transform duration-200">${icon('plus', 'w-7 h-7', 2.5)}</span>`;
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

  mountTabSwipe({
    order: VIEW_ORDER,
    current: () => view,
    go: setView,
    blocked: () => isEditorOpen() || isReaderOpen(),
  });
  mountDrawer({ onOpen: () => toggleSortMenu(false) });
  mountTheme();
  preventNativeMenu();
  $('#tabs').onclick = (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('[data-view]')?.dataset.view as View | undefined;
    if (v) setView(v);
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

// ---------- شبكة أمان ضد الشاشة الفارغة ----------
// أحياناً يتأخر IndexedDB أو يعلَق اتصاله بعد تحديث/إعادة تحميل؛ فنعيد المحاولة بدل ترك الشاشة بلا ملاحظات.
function guardFirstRender() {
  let tries = 0;
  const t = setInterval(() => {
    if (firstRender || ++tries > 4) return clearInterval(t);
    void db.open().catch(() => {});
    subscribe();
    void refreshNow();
  }, 1500);
  const heal = () => {
    if (document.visibilityState === 'visible') void refreshNow();
  };
  document.addEventListener('visibilitychange', heal);
  window.addEventListener('pageshow', heal); // الرجوع من الذاكرة المؤقتة للصفحة
}

// ---------- البدء ----------
db.on('blocked', () => reportError('هناك نافذة أخرى من التطبيق مفتوحة بنسخة قديمة. أغلقها ثم حدّث هذه الصفحة.'));
db.open().catch((err) => reportError(dbMessage(err)));
setOnSaved((id, expectPresent) => void afterSave(id, expectPresent));
loadPrefs();
mountChrome();
wire();
subscribe();
guardFirstRender();
void purgeOldTrash();
mountPwa();
mountBackup();

handleLaunchIntent();

appReady();
