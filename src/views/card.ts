import type { Note } from '../types';
import { html, raw, type SafeHtml } from '../lib/html';
import { icon } from '../lib/icons';
import { drawingPreviewSvg } from '../lib/draw';

/** ما تحتاجه البطاقة من السياق: لا تقرأ حالة التطبيق مباشرة، فتبقى دالة نقية قابلة للاختبار. */
export interface CardContext {
  /** عرض المهملات: تُضاف أزرار الاستعادة والحذف النهائي. */
  trash: boolean;
  layout: 'grid' | 'list';
  /** ينشئ رابطاً مؤقتاً لملف وسائط (يتولى المستدعي إلغاءه). */
  blobUrl: (b: Blob) => string;
}

/** ملخّص سطر واحد/سطرين لعرض الصفوف. */
function summaryOf(n: Note): string {
  if (n.type === 'list') {
    const done = n.items.filter((i) => i.done).length;
    return n.items.length ? `${n.items.length} عناصر، تمّ منها ${done}` : '';
  }
  return n.body.trim().slice(0, 100);
}

export function cardHTML(n: Note, ctx: CardContext): string {
  return String(card(n, ctx));
}

function card(n: Note, ctx: CardContext): SafeHtml {
  const { trash, layout, blobUrl } = ctx;
  const imgs = n.attachments.filter((a) => a.kind === 'image' && a.blob);
  const draws = n.attachments.filter((a) => a.kind === 'draw' && a.drawing?.strokes.length);
  const img0 = imgs[0]?.blob;
  const draw0 = draws[0]?.drawing;
  const audios = n.attachments.filter((a) => a.kind === 'audio' && a.blob);
  const base = `note-card nc-${n.color} cursor-pointer overflow-hidden rounded-[18px] border border-black/[0.07] dark:border-white/10`;
  const tab = trash ? '' : raw('tabindex="0"');

  const actions = trash
    ? html`<div class="flex shrink-0 gap-1 border-t border-black/5 px-2 dark:border-white/10">
         <button type="button" data-act="restore" class="flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-brand-600 dark:text-brand-300">${raw(icon('restore', 'w-4 h-4'))} استعادة</button>
         <button type="button" data-act="purge" class="ms-auto flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-red-500">${raw(icon('trash', 'w-4 h-4'))} حذف نهائي</button>
       </div>`
    : '';

  // ---- عرض الصفوف: ارتفاع ثابت، صورة مصغّرة ثم العنوان والوصف ----
  if (layout === 'list') {
    let thumb: SafeHtml = raw(icon(n.type === 'list' ? 'list' : 'notes', 'w-6 h-6'));
    let fallback = summaryOf(n);
    if (img0) {
      thumb = html`<img src="${blobUrl(img0)}" alt="" loading="lazy" class="h-full w-full object-cover" />`;
      fallback ||= 'صورة';
    } else if (draw0) {
      thumb = html`<div class="h-full w-full p-1 text-slate-800 [&>svg]:h-full [&>svg]:w-full dark:text-slate-100">${raw(drawingPreviewSvg(draw0))}</div>`;
      fallback ||= 'رسم';
    } else if (audios.length) {
      thumb = raw(icon('mic', 'w-6 h-6'));
      fallback ||= 'تسجيل صوتي';
    }
    return html`<article class="${base} flex ${trash ? 'min-h-[84px] flex-col' : 'h-[84px] items-center gap-3 p-2.5'}" data-id="${n.id}" ${tab}>
      <div class="${trash ? 'flex flex-1 items-center gap-3 p-2.5' : 'contents'}">
        <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/70 text-slate-500 dark:bg-black/20 dark:text-slate-300">${thumb}</div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-[15px] font-semibold">${n.pinned ? '📌 ' : ''}${n.title || fallback || 'ملاحظة'}</h3>
          ${n.title && fallback ? html`<p class="clamp-2 mt-0.5 break-words text-[12.5px] leading-snug opacity-70">${fallback}</p>` : ''}
        </div>
      </div>${actions}
    </article>`;
  }

  // ---- عرض الشبكة: بطاقات مربّعة متقاربة الحجم ----
  const chip = (name: Parameters<typeof icon>[0], label = '') =>
    html`<span class="inline-flex items-center gap-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[11px] dark:bg-white/10">${raw(icon(name, 'w-3.5 h-3.5'))}${label}</span>`;
  const cover = imgs.length ? 'img' : draws.length ? 'draw' : '';
  const chips: SafeHtml[] = [];
  if (audios.length) chips.push(chip('mic', audios.length > 1 ? String(audios.length) : ''));
  if (imgs.length > 1) chips.push(chip('image', `+${imgs.length - 1}`));
  const extraDraws = cover === 'img' ? draws.length : draws.length - 1;
  if (extraDraws > 0) chips.push(chip('pencil', String(extraDraws)));
  const chipRow = chips.length ? html`<div class="absolute bottom-2 start-3 z-[1] flex gap-1">${chips}</div>` : '';
  const pin = n.pinned ? html`<span class="absolute end-2 top-2 z-[1] text-[11px] opacity-60">📌</span>` : '';

  let inner: SafeHtml;
  if (cover) {
    const layer =
      cover === 'img' && img0
        ? html`<img src="${blobUrl(img0)}" alt="${n.title || 'صورة'}" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />`
        : html`<div class="absolute inset-0 flex items-center justify-center p-3 pb-10 text-slate-800 dark:text-slate-100 [&>svg]:max-h-full [&>svg]:w-full">${draw0 ? raw(drawingPreviewSvg(draw0)) : ''}</div>`;
    const dark = cover === 'img';
    const cap = n.title || (cover === 'draw' ? 'رسم' : '');
    inner = html`${layer}${
      cap
        ? html`<div class="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-3 pb-2 pt-7 text-[13px] font-semibold ${
            dark ? 'bg-gradient-to-t from-black/60 to-transparent text-white' : 'card-fade'
          }"><span class="truncate">${cap}</span></div>`
        : ''
    }${dark && chips.length ? '' : chipRow}`;
  } else {
    let content: SafeHtml | string = '';
    if (n.type === 'text') {
      if (n.body)
        content = html`<p class="clamp-5 whitespace-pre-wrap break-words text-[13px] leading-[1.65] opacity-80">${n.body.slice(0, 260)}</p>`;
    } else {
      const all = n.items.filter((i) => i.text.trim());
      const shown = all.slice(0, 4);
      const more = all.length - shown.length;
      content = html`<ul class="text-[13px]">${shown.map(
        (i) => html`<li class="flex h-[26px] items-center gap-2 ${i.done ? 'line-through opacity-50' : 'opacity-85'}">
            <span class="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border-[1.6px] border-current">${i.done ? raw(icon('check', 'w-2.5 h-2.5', 3.5)) : ''}</span>
            <span class="truncate">${i.text}</span></li>`,
      )}${more > 0 ? html`<li class="mt-0.5 text-[11px] opacity-60">+ ${more} عناصر أخرى</li>` : ''}</ul>`;
    }
    if (!content && !n.title && audios.length)
      content = html`<div class="mt-6 flex justify-center opacity-70">${raw(icon('mic', 'w-10 h-10', 1.6))}</div>`;
    inner = html`<div class="p-3 ${n.pinned ? 'pe-7' : ''}">${
      n.title ? html`<h3 class="clamp-2 mb-1 break-words text-[15px] font-semibold leading-snug">${n.title}</h3>` : ''
    }${content}</div><div class="card-fade pointer-events-none absolute inset-x-0 bottom-0 h-9"></div>${chipRow}`;
  }

  return html`<article class="${base} relative flex aspect-square flex-col" data-id="${n.id}" ${tab}>
    <div class="relative min-h-0 flex-1 overflow-hidden">${pin}${inner}</div>${actions}
  </article>`;
}
