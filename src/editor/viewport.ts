import { hooks } from './session';

// ---------- تجربة الهاتف: لوحة المفاتيح وزر الرجوع ----------
/** يحافظ على المحرر داخل المساحة المرئية فوق لوحة المفاتيح (iOS لا يغيّر الـ layout viewport). */
export function fitViewport() {
  const vv = window.visualViewport;
  const el = document.getElementById('editor');
  if (!vv || !el) return;
  const kb = window.innerHeight - vv.height - vv.offsetTop > 80 || vv.height < window.innerHeight - 120;
  el.classList.toggle('kb-open', kb);
  if (kb) {
    el.style.top = `${vv.offsetTop}px`;
    el.style.height = `${vv.height}px`;
    el.style.bottom = 'auto';
  } else {
    el.style.top = el.style.height = el.style.bottom = '';
  }
}
export function trackViewport(on: boolean) {
  const vv = window.visualViewport;
  if (!vv) return;
  vv[on ? 'addEventListener' : 'removeEventListener']('resize', fitViewport);
  vv[on ? 'addEventListener' : 'removeEventListener']('scroll', fitViewport);
  const el = document.getElementById('editor');
  if (!on && el) {
    el.classList.remove('kb-open');
    el.style.top = el.style.height = el.style.bottom = '';
  } else fitViewport();
}

/** زر/إيماءة الرجوع في الهاتف يغلق المحرر بدل مغادرة التطبيق. */
let histPushed = false;
export function pushHist() {
  try {
    history.pushState({ nawyNote: 'editor' }, '');
    histPushed = true;
  } catch {
    /* بيئة بلا history: نتجاهل */
  }
}
export function popHist() {
  if (!histPushed) return;
  histPushed = false;
  try {
    history.back();
  } catch {
    /* ignore */
  }
}
window.addEventListener('popstate', () => {
  if (histPushed) {
    histPushed = false; // المتصفح رجع بالفعل
    void hooks.closeEditor();
  }
});
