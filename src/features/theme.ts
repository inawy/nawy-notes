import brand from '../../brand.json';
import { $ } from '../lib/util';
import { icon } from '../lib/icons';

/** لون شريط الحالة = لون خلفية الصفحة (index.html يكرّره في السكربت المبكر قبل تحميل الوحدات). */
export const THEME_COLOR = { light: brand.pageLight, dark: brand.pageDark } as const;
const THEME_KEY = 'nawy-note:theme';

export function syncTheme(): void {
  const dark = document.documentElement.classList.contains('dark');
  $('#btnTheme').innerHTML = icon(dark ? 'sun' : 'moon') + `<span>${dark ? 'الوضع النهاري' : 'الوضع الليلي'}</span>`;
  document
    .querySelector('meta[name=theme-color]')
    ?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

export function mountTheme(): void {
  $('#btnTheme').onclick = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* التخزين محجوب */
    }
    syncTheme();
  };
  syncTheme();
}
