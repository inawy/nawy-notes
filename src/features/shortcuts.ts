import { $ } from '../lib/util';
import { html, raw } from '../lib/html';
import { icon } from '../lib/icons';
import { trapFocus } from '../lib/focus-trap';

export type ShortcutAction =
  | 'new-text'
  | 'new-list'
  | 'search'
  | 'layout'
  | 'sidebar'
  | 'help'
  | 'view-notes'
  | 'view-archive'
  | 'view-trash'
  | 'close-editor';

export interface KeyInfo {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}
export interface KeyContext {
  /** المستخدم يكتب في حقل. */
  typing: boolean;
  editorOpen: boolean;
  /** قارئ أو نافذة مساعدة مفتوحة. */
  dialogOpen: boolean;
}

/**
 * يترجم ضغطة مفتاح إلى إجراء. يعتمد على `code` (موضع المفتاح) لا على الحرف،
 * فتعمل الاختصارات مع لوحة المفاتيح العربية أيضاً.
 * منطق نقي قابل للاختبار.
 */
export function matchShortcut(e: KeyInfo, ctx: KeyContext): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyK' && !ctx.editorOpen && !ctx.dialogOpen) return 'search';
  if (mod && !e.altKey && e.code === 'Enter' && ctx.editorOpen) return 'close-editor';
  if (ctx.typing || ctx.editorOpen || ctx.dialogOpen) return null;
  // Ctrl+N يحجزه المتصفح في التبويب العادي، لكنه يعمل في التطبيق المثبَّت
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyN') return 'new-text';
  if (mod || e.altKey) return null;
  if (e.code === 'Slash') return e.shiftKey ? 'help' : 'search';
  if (e.shiftKey) return null;
  switch (e.code) {
    case 'KeyC':
      return 'new-text';
    case 'KeyL':
      return 'new-list';
    case 'KeyG':
      return 'layout';
    case 'KeyB':
      return 'sidebar';
    case 'Digit1':
      return 'view-notes';
    case 'Digit2':
      return 'view-archive';
    case 'Digit3':
      return 'view-trash';
    default:
      return null;
  }
}

const ROWS: { keys: string[][]; label: string }[] = [
  { keys: [['C'], ['Ctrl', 'N']], label: 'ملاحظة نصية جديدة' },
  { keys: [['L']], label: 'قائمة مهام جديدة' },
  { keys: [['/'], ['Ctrl', 'K']], label: 'بحث' },
  { keys: [['G']], label: 'التبديل بين الشبكة والقائمة' },
  { keys: [['1'], ['2'], ['3']], label: 'الملاحظات · الأرشيف · المهملات' },
  { keys: [['B']], label: 'إخفاء/إظهار الشريط الجانبي' },
  { keys: [['Ctrl', 'Enter']], label: 'حفظ وإغلاق المحرر' },
  { keys: [['Esc']], label: 'إغلاق النافذة المفتوحة' },
  { keys: [['?']], label: 'عرض هذه القائمة' },
];

const kbd = (k: string) =>
  html`<kbd class="inline-flex min-h-7 min-w-7 items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-1.5 text-xs font-medium text-slate-600 shadow-[0_1px_0_rgb(0_0_0/0.08)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300" dir="ltr">${k}</kbd>`;

let release: (() => void) | null = null;

export function isShortcutsHelpOpen(): boolean {
  return !!document.getElementById('shortcutsHelp');
}

export function closeShortcutsHelp(): void {
  document.getElementById('shortcutsHelp')?.remove();
  release?.();
  release = null;
}

export function showShortcutsHelp(): void {
  if (isShortcutsHelpOpen()) return;
  const wrap = document.createElement('div');
  wrap.id = 'shortcutsHelp';
  wrap.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'اختصارات لوحة المفاتيح');
  wrap.innerHTML = String(html`
    <div class="sheet-enter w-full max-w-md rounded-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
      <div class="mb-3 flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">${raw(icon('keyboard', 'w-5 h-5'))}</span>
        <h2 class="flex-1 text-lg font-semibold">اختصارات لوحة المفاتيح</h2>
        <button type="button" id="shClose" class="btn-icon !rounded-full" aria-label="إغلاق">${raw(icon('x', 'w-5 h-5'))}</button>
      </div>
      <ul class="divide-y divide-slate-100 dark:divide-slate-800">
        ${ROWS.map(
          (r) => html`<li class="flex items-center gap-3 py-2.5 text-sm">
            <span class="flex-1">${r.label}</span>
            <span class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              ${r.keys.map(
                (combo, i) => html`${i ? html`<span class="text-xs text-slate-400">أو</span>` : ''}<span class="inline-flex items-center gap-1" dir="ltr">${combo.map((k, j) => html`${j ? html`<span class="text-slate-400">+</span>` : ''}${kbd(k)}`)}</span>`,
              )}
            </span>
          </li>`,
        )}
      </ul>
      <p class="mt-3 text-xs text-slate-400">تعمل الاختصارات حتى مع لوحة المفاتيح العربية، ولا تعمل أثناء الكتابة في حقل.</p>
    </div>`);
  document.body.appendChild(wrap);
  wrap.onclick = (e) => {
    if (e.target === wrap) closeShortcutsHelp();
  };
  $('#shClose', wrap).onclick = closeShortcutsHelp;
  release = trapFocus(wrap, { onEscape: closeShortcutsHelp, initial: $('#shClose', wrap) });
}

export interface ShortcutHandlers {
  newNote: (type: 'text' | 'list') => void;
  focusSearch: () => void;
  toggleLayout: () => void;
  toggleSidebar: () => void;
  setView: (v: 'notes' | 'archive' | 'trash') => void;
  closeEditor: () => void;
  isEditorOpen: () => boolean;
  /** قارئ/قائمة أو أي نافذة أخرى مفتوحة (عدا نافذة الاختصارات نفسها). */
  isDialogOpen: () => boolean;
}

export function mountShortcuts(h: ShortcutHandlers): void {
  $('#btnShortcuts').innerHTML = icon('keyboard') + '<span>اختصارات لوحة المفاتيح</span>';
  $('#btnShortcuts').onclick = () => showShortcutsHelp();

  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.repeat || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const action = matchShortcut(e, {
      typing,
      editorOpen: h.isEditorOpen(),
      dialogOpen: h.isDialogOpen() || isShortcutsHelpOpen(),
    });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case 'new-text':
        return h.newNote('text');
      case 'new-list':
        return h.newNote('list');
      case 'search':
        return h.focusSearch();
      case 'layout':
        return h.toggleLayout();
      case 'sidebar':
        return h.toggleSidebar();
      case 'help':
        return showShortcutsHelp();
      case 'view-notes':
        return h.setView('notes');
      case 'view-archive':
        return h.setView('archive');
      case 'view-trash':
        return h.setView('trash');
      case 'close-editor':
        return h.closeEditor();
    }
  });
}
