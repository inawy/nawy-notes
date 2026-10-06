import type { Note } from '../types';
import type { DrawingBoard } from '../lib/draw';
import type { VoiceRecorder } from '../lib/media';
import { saveNote } from '../db';
import { debounce } from '../lib/util';
import { icon } from '../lib/icons';

/** إجراء يُنفَّذ فور فتح ملاحظة جديدة (من الزر العائم). */
export type InitialAction = 'draw' | 'audio' | 'image';

/** حالة جلسة التحرير الواحدة. كل وحدات المحرر تقرأ وتكتب هنا بدل متغيرات عامة متفرقة. */
export const st = {
  current: null as Note | null,
  dirty: false,
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
  el.classList.toggle('text-brand-600', on);
}

export const save = debounce(async () => {
  if (st.current && st.dirty) {
    st.dirty = false;
    await saveNote(st.current);
  }
  showSaved(true);
}, 400);

export function touch() {
  st.dirty = true;
  showSaved(false);
  save();
}
