import { type Attachment } from '../types';
import { isEmptyNote } from '../db';
import { uid } from '../lib/util';
import { icon } from '../lib/icons';
import { drawingPreviewSvg } from '../lib/draw';
import { VoiceRecorder, pickFile, resizeImage } from '../lib/media';
import { micState, needsMicIntro, showMicHelp, showMicIntro } from '../lib/permission';
import { toast } from '../lib/toast';
import { st, hooks, blobUrl, releaseUrls, touch } from './session';
import { startDrawing } from './draw-mode';

// ============================================================
//  المرفقات: صور / رسوم / تسجيلات
// ============================================================
export const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export const rmBtn = (id: string, cls = 'absolute end-2 top-2 bg-black/55 text-white') =>
  `<button type="button" data-rm="${id}" class="${cls} flex h-7 w-7 items-center justify-center rounded-full" aria-label="حذف">${icon('x', 'w-4 h-4')}</button>`;

export function renderMedia() {
  const n = st.current;
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
  if (st.recorder) {
    html += `<div class="flex items-center gap-3 rounded-xl bg-red-500/10 px-3 py-2">
      <span class="h-3 w-3 animate-pulse rounded-full bg-red-500"></span>
      <span id="recTime" class="text-sm tabular-nums">${fmtTime(st.recSec)}</span>
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
    if (rm && st.current) {
      st.current.attachments = st.current.attachments.filter((a) => a.id !== rm);
      touch();
      renderMedia();
    } else if (ed) startDrawing(ed);
    else if (t.closest('#recStop')) void stopRecording(true);
    else if (t.closest('#recCancel')) void stopRecording(false);
  };
}

export function addAttachment(a: Attachment) {
  st.current?.attachments.push(a);
  touch();
}

// ---------- صورة ----------
export async function addImage(fromInit = false) {
  const file = await pickFile('image/*');
  if (!file) {
    // ألغى المستخدم الاختيار من الزر العائم: لا نترك محرراً فارغاً
    if (fromInit && st.current && isEmptyNote(st.current)) void hooks.closeEditor();
    return;
  }
  try {
    const blob = await resizeImage(file);
    if (!st.current) return;
    addAttachment({ id: uid(), kind: 'image', blob, drawing: null });
    renderMedia();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'تعذّر فتح الصورة');
  }
}

// ---------- تسجيل صوتي ----------
/** بديل بلا إذن ميكروفون: مسجّل الجهاز نفسه (أو اختيار ملف صوتي). */
export async function addDeviceRecording(capture: boolean) {
  const file = await pickFile('audio/*', capture);
  if (!file || !st.current) return;
  addAttachment({ id: uid(), kind: 'audio', blob: file, drawing: null });
  renderMedia();
}

export function micHelp() {
  showMicHelp(() => void startRecording(), (capture) => void addDeviceRecording(capture)); // يبقى المحرر مفتوحاً
}

export async function startRecording(skipIntro = false) {
  if (st.recorder || !st.current) return;
  if (!skipIntro) {
    const mic = await micState();
    if (!st.current) return;
    if (mic === 'denied') return micHelp(); // لا فائدة من الطلب: المتصفح سيرفضه فوراً
    if (needsMicIntro(mic)) {
      showMicIntro(
        () => void startRecording(true),
        () => {
          if (st.current && isEmptyNote(st.current)) void hooks.closeEditor();
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
    if (st.current && isEmptyNote(st.current)) void hooks.closeEditor();
    return;
  }
  if (!st.current) return r.cancel(); // أُغلق المحرر أثناء طلب الإذن
  st.recorder = r;
  st.recSec = 0;
  st.timerId = setInterval(() => {
    st.recSec++;
    const el = document.getElementById('recTime');
    if (el) el.textContent = fmtTime(st.recSec);
  }, 1000);
  renderMedia();
}

export async function stopRecording(keep: boolean) {
  const r = st.recorder;
  if (!r) return;
  st.recorder = null;
  clearInterval(st.timerId);
  if (keep) {
    try {
      const blob = await r.stop();
      if (st.current) addAttachment({ id: uid(), kind: 'audio', blob, drawing: null });
    } catch {
      toast('تعذّر إنهاء التسجيل');
    }
  } else r.cancel();
  renderMedia();
}

