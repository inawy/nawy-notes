import type { Note } from './types';
import { $, esc } from './lib/util';
import { icon } from './lib/icons';
import { drawingPreviewSvg } from './lib/draw';
import { swipeDismiss } from './lib/swipe-dismiss';

/**
 * وضع القراءة: النقر على بطاقة يفتح ورقة قراءة بلا لوحة مفاتيح.
 * النقر على المحتوى (نص/رسم/صورة) أو زر «تعديل» ينقل للتحرير.
 */
let isOpen = false;
let hist = false;
let urls: string[] = [];
let wired = false;

export function isReaderOpen(): boolean {
  return isOpen;
}

window.addEventListener('popstate', () => {
  if (hist) {
    hist = false; // المتصفح رجع بالفعل
    hide();
  }
});

function hide() {
  if (!isOpen) return;
  isOpen = false;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  const el = $('#reader');
  el.classList.add('hidden');
  el.classList.remove('flex');
  $('#readerBody').innerHTML = '';
  document.body.classList.remove('overflow-hidden');
}

export function closeReader(): void {
  if (!isOpen) return;
  const had = hist;
  hist = false;
  hide();
  if (had) {
    try {
      history.back();
    } catch {
      /* ignore */
    }
  }
}

export function openReader(n: Note, onEdit: (n: Note) => void): void {
  const url = (b: Blob) => {
    const u = URL.createObjectURL(b);
    urls.push(u);
    return u;
  };
  const media = n.attachments
    .map((a) => {
      if (a.kind === 'image' && a.blob)
        return `<img src="${url(a.blob)}" alt="" class="mb-3 block max-h-[60dvh] w-full rounded-2xl object-contain" />`;
      if (a.kind === 'draw' && a.drawing?.strokes.length)
        return `<div class="mb-3 rounded-2xl bg-white/70 p-3 text-slate-800 dark:bg-black/20 dark:text-slate-100">${drawingPreviewSvg(a.drawing)}</div>`;
      if (a.kind === 'audio' && a.blob)
        return `<audio controls preload="metadata" src="${url(a.blob)}" class="mb-3 w-full"></audio>`;
      return '';
    })
    .join('');

  const body =
    n.type === 'list'
      ? `<ul class="space-y-2 text-base">` +
        n.items
          .filter((i) => i.text.trim())
          .map(
            (i) => `<li class="flex items-start gap-3 ${i.done ? 'line-through opacity-50' : ''}">
              <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-current">${i.done ? icon('check', 'w-3.5 h-3.5', 3) : ''}</span>
              <span class="break-words">${esc(i.text)}</span></li>`,
          )
          .join('') +
        `</ul>`
      : n.body
        ? `<p class="whitespace-pre-wrap break-words text-base leading-8">${esc(n.body)}</p>`
        : '';

  const when = new Date(n.updatedAt).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  const card = $('#readerCard');
  card.style.cssText = ''; // يزيل أثر سحب سابق
  card.className = `sheet-enter relative flex max-h-[92dvh] min-h-[50dvh] w-full flex-col overflow-hidden rounded-t-[26px] border border-black/5 sm:max-w-xl sm:rounded-3xl dark:border-white/10 nc-${n.color}`;
  $('#readerBody').innerHTML = `
    <div class="flex shrink-0 items-center gap-1 px-2 pt-2">
      <button type="button" id="rClose" class="btn-icon !h-12 !w-12 !rounded-full" aria-label="إغلاق">${icon('x', 'w-6 h-6')}</button>
      <span class="flex-1"></span>
      <button type="button" id="rEdit" class="flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-medium text-white active:scale-95">${icon('pencil', 'w-4 h-4')} تعديل</button>
    </div>
    <div id="rContent" class="min-h-0 flex-1 cursor-text overflow-y-auto overscroll-contain px-5 pb-8 pt-3">
      ${n.title ? `<h2 class="mb-4 break-words text-2xl font-semibold leading-snug">${esc(n.title)}</h2>` : ''}
      ${media}${body}
      <p class="mt-6 text-xs opacity-50">عُدّلت ${when} · اضغط على المحتوى للتعديل</p>
    </div>`;

  const el = $('#reader');
  el.classList.remove('hidden');
  el.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  isOpen = true;
  try {
    history.pushState({ nawyNote: 'reader' }, '');
    hist = true;
  } catch {
    /* ignore */
  }

  const edit = () => {
    closeReader();
    setTimeout(() => onEdit(n), 60); // بعد أن يستقر الرجوع في السجل
  };
  $('#rClose').onclick = () => closeReader();
  $('#rEdit').onclick = edit;
  $('#rContent').onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('audio, button')) return;
    if (window.getSelection()?.toString()) return;
    edit();
  };
  el.onclick = (e) => {
    if (e.target === el) closeReader();
  };
  if (!wired) {
    wired = true;
    swipeDismiss(
      card,
      () => closeReader(),
      () => document.getElementById('rContent'),
    );
  }
}
