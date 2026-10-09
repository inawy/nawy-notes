/**
 * يجعل النافذة السفلية تُغلق بالسحب: للأسفل (إن كان المحتوى في أعلاه) أو لأي من الجانبين.
 * النافذة تتبع الإصبع، وعند تجاوز العتبة أو بحركة سريعة تنزلق خارج الشاشة ثم يُستدعى onDismiss.
 */
const DIST = 100; // px
const FLICK = 0.6; // px/ms

export function swipeDismiss(el: HTMLElement, onDismiss: () => void, scroller?: () => HTMLElement | null): void {
  let sx = 0,
    sy = 0,
    st = 0;
  let axis: 'x' | 'y' | 'none' | null = null;
  let dx = 0,
    dy = 0;

  const apply = (x: number, y: number, animate: boolean) => {
    el.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s' : 'none';
    el.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
    const far = Math.max(Math.abs(x), Math.abs(y));
    el.style.opacity = String(Math.max(0.35, 1 - far / 400));
  };

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) {
        axis = 'none';
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
      axis = null;
      dx = dy = 0;
      el.style.animation = 'none'; // لا تتعارض حركة الدخول مع التتبع
    },
    { passive: true },
  );

  el.addEventListener(
    'touchmove',
    (e) => {
      if (axis === 'none') return;
      const t = e.touches[0];
      if (!t) return;
      dx = t.clientX - sx;
      dy = t.clientY - sy;
      if (axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const target = e.target as HTMLElement;
        if (target.closest('audio, input, textarea, canvas')) {
          axis = 'none';
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) * 1.2) axis = 'x';
        else if (dy > 0 && (scroller?.()?.scrollTop ?? 0) <= 0) axis = 'y';
        else {
          axis = 'none';
          return;
        }
      }
      if (e.cancelable) e.preventDefault(); // يمنع التمرير/التحديث بالسحب أثناء التتبع
      apply(axis === 'x' ? dx : 0, axis === 'y' ? Math.max(0, dy) : 0, false);
    },
    { passive: false },
  );

  const end = () => {
    if (axis !== 'x' && axis !== 'y') {
      axis = null;
      return;
    }
    const d = axis === 'x' ? Math.abs(dx) : dy;
    const v = d / Math.max(1, Date.now() - st);
    const go = d > DIST || (d > 30 && v > FLICK);
    if (go) {
      const out = axis === 'x' ? Math.sign(dx) * window.innerWidth : 0;
      const down = axis === 'y' ? window.innerHeight : 0;
      apply(out, down, true);
      setTimeout(onDismiss, 200);
    } else apply(0, 0, true);
    axis = null;
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', () => {
    apply(0, 0, true);
    axis = null;
  });
}
