import type { Note } from '../types';
import type { DrawingBoard } from '../lib/draw';
import type { VoiceRecorder } from '../lib/media';
import { saveNoteGuarded } from '../db';
import { debounce } from '../lib/util';
import { icon } from '../lib/icons';
import { toast } from '../lib/toast';
import { clearDraft, makeDraft, writeDraft } from '../lib/draft';
import { saveErrorMessage } from '../lib/storage-errors';

/** إجراء يُنفَّذ فور فتح ملاحظة جديدة (من الزر العائم). */
export type InitialAction = 'draw' | 'audio' | 'image';

/** حالة جلسة التحرير الواحدة. كل وحدات المحرر تقرأ وتكتب هنا بدل متغيرات عامة متفرقة. */
export const st = {
  current: null as Note | null,
  dirty: false,
  /** آخر updatedAt عرفناه للملاحظة في المخزن (لكشف تعديل تبويب آخر). */
  baseUpdatedAt: 0,
  closing: false,
  /** النافذة المنبثقة المفتوحة في الشريط السفلي. */
  pop: null as 'add' | 'color' | null,
  /** وضع الرسم: يحل مؤقتاً محل محتوى الملاحظة. */
  drawingId: null as string | null,
  board: null as DrawingBoard | null,
  /** التسجيل الصوتي. */
  recorder: null as VoiceRecorder | null,
  recSec: 0,
  timerId: undefined as ReturnType<typeof setInterval> | undefined,
};

/**
 * دوال تعرّفها الوحدة الرئيسية وتستدعيها وحدات أخرى؛ تفادياً للاستيراد الدائري.
 */
export const hooks = {
  renderAll: () => {},
  renderNote: (_n: Note) => {},
  applyColor: (_n: Note) => {},
  closeEditor: async () => {},
};

/** يُستدعى بعد كل حفظ/حذف نهائي من المحرر ليحدّث الواجهة ويتحقق من النتيجة. */
let onSaved: (id: string, expectPresent: boolean) => void = () => {};
export function setOnSaved(fn: typeof onSaved): void {
  onSaved = fn;
}
export function notifySaved(id: string, expectPresent: boolean): void {
  onSaved(id, expectPresent);
}

// روابط مؤقتة للوسائط المعروضة
let urls: string[] = [];
export const blobUrl = (b: Blob): string => {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
};
export const releaseUrls = () => {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
};

export function showSaved(on: boolean) {
  const el = document.getElementById('eSaved');
  if (!el) return;
  el.innerHTML = on ? `${icon('check', 'w-3.5 h-3.5', 3)}<span>محفوظة</span>` : '<span>جارٍ الحفظ…</span>';
  el.classList.remove('text-red-600');
  el.classList.toggle('text-brand-600', on);
}

export function showSaveFailed() {
  const el = document.getElementById('eSaved');
  if (!el) return;
  el.innerHTML = '<span>تعذّر الحفظ — سنعيد المحاولة</span>';
  el.classList.remove('text-brand-600');
  el.classList.add('text-red-600');
}

let failStreak = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * يحفظ الملاحظة الحالية. عند الفشل (امتلاء التخزين مثلاً) تبقى dirty وتبقى المسودة في localStorage
 * وتُعاد المحاولة تلقائياً؛ لا يضيع النص ولا يُغلق المحرر. يُرجع true عند النجاح.
 */
export async function persist(): Promise<boolean> {
  const n = st.current;
  if (!n) return true;
  const oldId = n.id;
  try {
    const { conflict } = await saveNoteGuarded(n, st.baseUpdatedAt);
    st.baseUpdatedAt = n.updatedAt;
    st.dirty = false;
    failStreak = 0;
    clearTimeout(retryTimer);
    clearDraft(oldId);
    if (conflict) toast('عُدّلت هذه الملاحظة في نافذة أخرى — حُفظت تعديلاتك كنسخة جديدة دون فقدان شيء', undefined);
    return true;
  } catch (err) {
    st.dirty = true;
    writeDraft(makeDraft(n, Date.now()));
    console.error(err);
    if (failStreak++ === 0) toast(saveErrorMessage(err));
    showSaveFailed();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => save(), 5000);
    return false;
  }
}

export const save = debounce(async () => {
  if (st.current && st.dirty) {
    if (!(await persist())) return;
  }
  showSaved(true);
}, 400);

export function touch() {
  st.dirty = true;
  showSaved(false);
  if (st.current) writeDraft(makeDraft(st.current, Date.now()));
  save();
}
