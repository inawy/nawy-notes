let timer: ReturnType<typeof setTimeout> | undefined;

/** رسالة قصيرة؛ مع action يظهر زر (مثل «تراجع») وتبقى مدة أطول. */
export function toast(msg: string, action?: { label: string; run: () => void }): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('pointer-events-none', !action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.className = 'ms-4 min-h-11 px-2 font-semibold text-brand-300';
    b.onclick = () => {
      el.classList.add('opacity-0', 'pointer-events-none');
      action.run();
    };
    el.appendChild(b);
  }
  el.classList.remove('opacity-0');
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.add('opacity-0', 'pointer-events-none');
  }, action ? 5000 : 2200);
}
