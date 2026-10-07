import { $ } from '../lib/util';
import { trapFocus } from '../lib/focus-trap';

const SIDEBAR_KEY = 'nawy-note:sidebar'; // 'closed' فقط حين يطويها المستخدم على الشاشات الكبيرة
const DESKTOP = '(min-width: 1024px)';

/**
 * القائمة الجانبية:
 * - الهاتف/الشاشة الضيقة: ورقة فوق المحتوى تُفتح بزر القائمة وتُغلق بالنقر خارجها أو Esc أو السويب نحو حافتها.
 * - الشاشة العريضة (≥1024px): شريط جانبي ثابت يدفع المحتوى، يُطوى ويُفتح بزر القائمة ويُحفظ اختيار المستخدم.
 */
export function mountDrawer(opts: { onOpen?: () => void } = {}): void {
  const mq = window.matchMedia(DESKTOP);
  const root = $('#drawerRoot');
  const html = document.documentElement;
  let release: (() => void) | null = null;

  const readPref = (): boolean => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
    } catch {
      return true;
    }
  };
  let sidebarOpen = readPref();

  const syncAria = (on: boolean) => $('#btnMenu').setAttribute('aria-expanded', String(on));

  // ---------- الهاتف: ورقة فوق المحتوى ----------
  const setSheet = (on: boolean) => {
    root.classList.toggle('hidden', !on);
    release?.();
    release = on ? trapFocus($('#drawer')) : null;
    syncAria(on);
  };

  // ---------- الشاشة العريضة: شريط ثابت ----------
  const applyDesktop = () => {
    html.classList.toggle('sb-open', mq.matches && sidebarOpen);
    if (mq.matches) {
      release?.();
      release = null;
      root.classList.add('hidden'); // حالة الورقة لا تتسرب إلى العريض؛ CSS هو من يُظهر الشريط
      syncAria(sidebarOpen);
    } else {
      html.classList.remove('sb-open');
      syncAria(!root.classList.contains('hidden'));
    }
  };
  mq.addEventListener('change', applyDesktop);
  applyDesktop();

  $('#btnMenu').onclick = () => {
    if (mq.matches) {
      sidebarOpen = !sidebarOpen;
      try {
        if (sidebarOpen) localStorage.removeItem(SIDEBAR_KEY);
        else localStorage.setItem(SIDEBAR_KEY, 'closed');
      } catch {
        /* التخزين محجوب */
      }
      applyDesktop();
      return;
    }
    opts.onOpen?.();
    setSheet(true);
  };
  $('#drawerBackdrop').onclick = () => !mq.matches && setSheet(false);
  $('#drawer').addEventListener('click', (e) => {
    if (!mq.matches && (e.target as HTMLElement).closest('button')) setSheet(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mq.matches) setSheet(false);
  });

  let sx = 0,
    sy = 0;
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
      if (mq.matches) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const towardEdge = getComputedStyle(document.documentElement).direction === 'rtl' ? dx : -dx;
      if (towardEdge > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) setSheet(false);
    },
    { passive: true },
  );
}
