import { $ } from '../lib/util';
import { trapFocus } from '../lib/focus-trap';

/** القائمة الجانبية: تُفتح بزر القائمة، وتُغلق بالنقر خارجها أو على عنصر أو Esc أو السويب نحو حافتها. */
export function mountDrawer(opts: { onOpen?: () => void } = {}): void {
  let release: (() => void) | null = null;
  const set = (on: boolean) => {
    $('#drawerRoot').classList.toggle('hidden', !on);
    release?.();
    release = on ? trapFocus($('#drawer')) : null;
    $('#btnMenu').setAttribute('aria-expanded', String(on));
  };
  $('#btnMenu').onclick = () => {
    opts.onOpen?.();
    set(true);
  };
  $('#drawerBackdrop').onclick = () => set(false);
  $('#drawer').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') set(false);
  });

  let sx = 0,
    sy = 0;
  const root = $('#drawerRoot');
  root.addEventListener(
    'touchstart',
    (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    },
    { passive: true },
  );
  root.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const towardEdge = getComputedStyle(document.documentElement).direction === 'rtl' ? dx : -dx;
      if (towardEdge > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) set(false);
    },
    { passive: true },
  );
}
