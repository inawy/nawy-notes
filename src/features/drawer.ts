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
  const drawer = $('#drawer');
  const backdrop = $('#drawerBackdrop');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** اتجاه الخروج: نحو الحافة التي ظهرت منها (RTL: يمين = +، LTR: يسار = −). */
  const exitSign = () => (getComputedStyle(html).direction === 'rtl' ? 1 : -1);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const clearInline = () => {
    drawer.style.transition = drawer.style.transform = '';
    backdrop.style.transition = backdrop.style.opacity = backdrop.style.animation = '';
  };

  /** إخفاء فوري بلا حركة (تغيير الحجم، أو عند تفضيل تقليل الحركة). */
  const hideNow = () => {
    clearTimeout(closeTimer);
    clearInline();
    root.classList.add('hidden');
    release?.();
    release = null;
    syncAria(false);
  };

  const setSheet = (on: boolean) => {
    if (!on) return hideNow();
    clearTimeout(closeTimer);
    clearInline();
    root.classList.remove('hidden');
    release?.();
    release = trapFocus(drawer);
    syncAria(true);
  };

  /** إغلاق بحركة انزلاق نحو الحافة التي ظهرت منها، يكمل من موضع الإصبع الحالي إن كان يسحب. */
  const closeSheet = () => {
    if (root.classList.contains('hidden')) return;
    if (reduced.matches) return hideNow();
    release?.(); // نحرّر التركيز فوراً؛ لا معنى لحبسه أثناء الخروج
    release = null;
    syncAria(false);
    drawer.style.transition = 'transform 0.22s var(--ease-out)';
    drawer.style.transform = `translateX(${exitSign() * 100}%)`;
    backdrop.style.animation = 'none';
    backdrop.style.transition = 'opacity 0.22s ease';
    backdrop.style.opacity = '0';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hideNow, 240);
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
  backdrop.onclick = () => !mq.matches && closeSheet();
  drawer.addEventListener('click', (e) => {
    if (!mq.matches && (e.target as HTMLElement).closest('button')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mq.matches) closeSheet();
  });

  // السحب نحو الحافة: القائمة تتبع الإصبع، وعند الإفلات تُكمل الخروج أو ترتد
  let sx = 0,
    sy = 0,
    dragging = false,
    tracking = false;
  const toward = (dx: number) => Math.max(0, dx * exitSign());
  root.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      tracking = !mq.matches && !!t;
      dragging = false;
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
    },
    { passive: true },
  );
  root.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (!tracking || !t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (!dragging) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < 1.2 * Math.abs(dy) || toward(dx) === 0) return;
        dragging = true;
        clearTimeout(closeTimer);
        drawer.style.transition = backdrop.style.transition = 'none';
        backdrop.style.animation = 'none';
      }
      const w = drawer.offsetWidth || 1;
      const px = Math.min(toward(dx), w);
      drawer.style.transform = `translateX(${exitSign() * px}px)`;
      backdrop.style.opacity = String(1 - px / w);
    },
    { passive: true },
  );
  const finish = (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!dragging || !t) return;
    dragging = false;
    const px = toward(t.clientX - sx);
    if (px > Math.min(80, (drawer.offsetWidth || 1) * 0.3)) closeSheet();
    else {
      // ارتداد لطيف إلى الوضع المفتوح
      drawer.style.transition = 'transform 0.2s var(--ease-out)';
      backdrop.style.transition = 'opacity 0.2s ease';
      drawer.style.transform = 'translateX(0)';
      backdrop.style.opacity = '1';
    }
  };
  root.addEventListener('touchend', finish, { passive: true });
  root.addEventListener('touchcancel', finish, { passive: true });
}
