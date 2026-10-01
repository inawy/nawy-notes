let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('opacity-0');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.add('opacity-0'), 2200);
}
