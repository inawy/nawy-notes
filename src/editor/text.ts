import { type CheckItem, type Note } from '../types';
import { $, esc, uid } from '../lib/util';
import { icon } from '../lib/icons';
import { st, hooks, touch } from './session';

// ---------- نص ----------
export const TIP_KEY = 'nawy-note:tip-dictation';

/** تلميح للهواتف: الكتابة بالصوت عبر ميكروفون لوحة المفاتيح (محلية وبلا إذن موقع). */
export function mountDictationTip(root: HTMLElement, n: Note) {
  try {
    if (!window.matchMedia('(pointer: coarse)').matches || localStorage.getItem(TIP_KEY) || n.body) return;
  } catch {
    return;
  }
  const tip = document.createElement('div');
  tip.className =
    'mt-2 flex items-center gap-1 rounded-xl bg-black/5 ps-3 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300';
  tip.innerHTML = `<span class="flex-1 py-2">للكتابة بالصوت: اضغط على ميكروفون لوحة المفاتيح 🎤</span>
    <button type="button" class="btn-icon" aria-label="إخفاء التلميح">${icon('x', 'w-4 h-4')}</button>`;
  tip.querySelector('button')!.onclick = () => {
    tip.remove();
    try {
      localStorage.setItem(TIP_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  root.appendChild(tip);
}

export function renderText(n: Note, root: HTMLElement) {
  root.innerHTML = `<textarea id="eText" rows="8" placeholder="اكتب ملاحظتك..."
    class="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-slate-400">${esc(n.body)}</textarea>`;
  const ta = $<HTMLTextAreaElement>('#eText', root);
  mountDictationTip(root, n);
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
export function renderList(n: Note, root: HTMLElement) {
  const row = (it: CheckItem) => `
    <div class="flex items-center gap-2" data-id="${it.id}">
      <input type="checkbox" class="h-4.5 w-4.5 shrink-0 accent-brand-500" ${it.done ? 'checked' : ''} aria-label="تم" />
      <input type="text" value="${esc(it.text)}" placeholder="عنصر"
        class="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-slate-400 ${it.done ? 'line-through opacity-50' : ''}" />
      <button type="button" class="rm btn-icon" aria-label="حذف العنصر">${icon('x', 'w-4 h-4')}</button>
    </div>`;
  const draw = () => {
    root.innerHTML = `<div class="space-y-1" id="rows">${n.items.map(row).join('')}</div>
      <button type="button" id="addItem" class="mt-2 flex items-center gap-2 text-sm text-slate-500 hover:text-brand-500">
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
export function toggleListMode() {
  const n = st.current;
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
    n.body = n.items
      .map((i) => i.text)
      .filter((t) => t.trim())
      .join('\n');
    n.items = [];
    n.type = 'text';
  }
  touch();
  st.pop = null;
  hooks.renderNote(n);
}
