/** سويب أفقي على المحتوى للتنقل بين العروض (RTL: نحو اليمين = التالي). */
export function mountTabSwipe<V extends string>(opts: {
  order: readonly V[];
  current: () => V;
  go: (v: V) => void;
  /** يمنع التتبع أثناء المحرر أو القراءة أو السحب والإفلات. */
  blocked: () => boolean;
}): void {
  let sx = 0, sy = 0, st = 0, tracking = false;
  const main = document.querySelector('main')!;
  main.addEventListener('touchstart', (e) => {
    tracking = e.touches.length === 1 && !opts.blocked() && !document.querySelector('.drag-chosen');
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2 || Date.now() - st > 600) return;
    if (document.querySelector('.drag-chosen')) return;
    const i = opts.order.indexOf(opts.current()) + (dx > 0 ? 1 : -1);
    if (i >= 0 && i < opts.order.length) opts.go(opts.order[i]);
  }, { passive: true });
}
