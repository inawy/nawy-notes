import { esc } from './util';
import { swipeDismiss } from './swipe-dismiss';
import { isIOS, isStandalone } from '../pwa/install';

/** خطوات تفعيل الميكروفون بحسب الجهاز (المتصفح لا يسمح بإعادة طلب الإذن بعد رفضه). */
export function micSteps(ua: string, installed: boolean, ios: boolean): string[] {
  if (ios) return ['افتح «الإعدادات» في الجهاز', 'اختر Safari ثم «الميكروفون»', 'اختر «السؤال» أو «السماح» ثم عُد إلى ناوي نوت'];
  if (/Android/i.test(ua)) {
    return installed
      ? ['افتح متصفح Chrome ثم ⋮ ثم «الإعدادات» ثم «إعدادات الموقع» ثم «الميكروفون»', 'ابحث عن موقع ناوي نوت (inawy.github.io) واختر «سماح»', 'أو من معلومات التطبيق اختر «إعادة ضبط الأذونات» (لا تختر «مسح البيانات» فهو يحذف ملاحظاتك)', 'إن بقي الأمر كما هو: إعدادات الهاتف ثم «التطبيقات» ثم Chrome ثم «الأذونات» ثم «الميكروفون» ثم «السماح»', 'عُد إلى ناوي نوت']
      : ['اضغط أيقونة القفل 🔒 بجوار عنوان الموقع', 'اختر «الأذونات» ثم «الميكروفون» ثم «سماح»', 'إن بقي الأمر كما هو: إعدادات الهاتف ثم «التطبيقات» ثم Chrome ثم «الأذونات» ثم «الميكروفون» ثم «السماح»', 'عُد هنا واضغط «إعادة المحاولة»'];
  }
  return ['اضغط أيقونة القفل 🔒 بجوار عنوان الموقع', 'فعّل «الميكروفون» (سماح)', 'اضغط «إعادة المحاولة» (وقد تحتاج لتحديث الصفحة)'];
}

/** نافذة سفلية تشرح كيف يُفعَّل الميكروفون وتتيح إعادة المحاولة. */
export function showMicHelp(onRetry: () => void, onDeviceRecorder?: (capture: boolean) => void): void {
  document.getElementById('micHelp')?.remove();
  const steps = micSteps(navigator.userAgent, isStandalone(window), isIOS(navigator));
  const wrap = document.createElement('div');
  wrap.id = 'micHelp';
  wrap.className = 'fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="sheet-enter w-full max-w-md rounded-t-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100 sm:rounded-2xl" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <h2 class="mb-2 text-lg font-semibold">الميكروفون غير مفعّل</h2>
      <p class="mb-3 text-sm text-slate-500 dark:text-slate-400">لم يُمنح إذن الميكروفون لهذا الموقع، والمتصفح لا يسمح للتطبيق بطلبه مرة أخرى بعد الرفض. فعّله من الإعدادات:</p>
      <ol class="mb-4 list-decimal space-y-1.5 ps-5 text-sm">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="flex gap-2">
        <button type="button" id="micRetry" class="btn-primary flex-1">إعادة المحاولة</button>
        <button type="button" id="micClose" class="btn-icon flex-1 !text-slate-600 dark:!text-slate-300">إغلاق</button>
      </div>
      ${onDeviceRecorder ? `<p class="mb-1 mt-4 text-xs text-slate-400">بدائل بلا إذن الميكروفون:</p>
      <div class="flex gap-2">
        <button type="button" id="micDevice" class="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-medium dark:border-slate-700">مسجّل الجهاز</button>
        <button type="button" id="micFile" class="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-medium dark:border-slate-700">اختيار ملف صوتي</button>
      </div>
      <p class="mt-1 text-xs text-slate-400">«مسجّل الجهاز» يعمل فقط إن كان في هاتفك تطبيق تسجيل يدعمه؛ وإلا سجّل من تطبيق التسجيل ثم اختر الملف.</p>` : ''}
    </div>`;
  let perm: PermissionStatus | null = null;
  const close = () => {
    if (perm) perm.onchange = null;
    wrap.remove();
  };
  wrap.onclick = (e) => {
    if (e.target === wrap) close();
  };
  document.body.appendChild(wrap);
  swipeDismiss(wrap.firstElementChild as HTMLElement, close);
  wrap.querySelector<HTMLElement>('#micClose')!.onclick = close;
  wrap.querySelector<HTMLElement>('#micRetry')!.onclick = () => {
    close();
    onRetry(); // نقرة مستخدم جديدة: شرط ظهور نافذة الإذن إن كانت الحالة "prompt"
  };
  wrap.querySelector<HTMLElement>('#micRetry')!.focus();
  for (const [id, capture] of [['#micDevice', true], ['#micFile', false]] as const) {
    const btn = wrap.querySelector<HTMLElement>(id);
    if (btn) btn.onclick = () => {
      close();
      onDeviceRecorder?.(capture); // داخل نقرة المستخدم: شرط فتح المسجّل/منتقي الملفات
    };
  }
  // عندما يفعّل المستخدم الإذن من الإعدادات ويعود، نكمل تلقائياً بلا نقرة إضافية
  void navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((st) => {
    perm = st;
    st.onchange = () => {
      if (st.state === 'granted' && wrap.isConnected) {
        close();
        onRetry();
      }
    };
  }).catch(() => { /* المتصفح لا يدعم استعلام الإذن: يبقى زر إعادة المحاولة */ });
}

export type MicState = 'granted' | 'prompt' | 'denied' | 'unknown';

/** حالة إذن الميكروفون دون طلبه (Safari لا يدعم الاستعلام فيعيد unknown). */
export async function micState(): Promise<MicState> {
  try {
    const st = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return st ? st.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

const INTRO_KEY = 'nawy-note:mic-intro';

/** هل نعرض الشرح قبل الطلب؟ عند "prompt" دائماً، وعند "unknown" مرة واحدة فقط. */
export function needsMicIntro(st: MicState): boolean {
  if (st === 'prompt') return true;
  if (st !== 'unknown') return false;
  try {
    if (localStorage.getItem(INTRO_KEY)) return false;
    localStorage.setItem(INTRO_KEY, '1');
  } catch { /* التخزين محجوب: نعرضه */ }
  return true;
}

/** شرح قصير قبل أول طلب إذن، حتى لا يضغط المستخدم «رفض» أو يغلق النافذة بالخطأ. */
export function showMicIntro(onGo: () => void, onCancel: () => void): void {
  document.getElementById('micIntro')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'micIntro';
  wrap.className = 'fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="sheet-enter w-full max-w-md rounded-t-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100 sm:rounded-2xl" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <h2 class="mb-2 text-lg font-semibold">التسجيل الصوتي يحتاج الميكروفون</h2>
      <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">سيظهر الآن طلب من المتصفح. اضغط <strong class="text-slate-800 dark:text-slate-100">«سماح»</strong> (أو «أثناء استخدام التطبيق»). يبقى التسجيل على جهازك فقط.</p>
      <div class="flex gap-2">
        <button type="button" id="introGo" class="btn-primary flex-1">متابعة</button>
        <button type="button" id="introCancel" class="btn-icon flex-1 !text-slate-600 dark:!text-slate-300">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const cancel = () => {
    wrap.remove();
    onCancel();
  };
  swipeDismiss(wrap.firstElementChild as HTMLElement, cancel);
  wrap.onclick = (e) => {
    if (e.target === wrap) cancel();
  };
  wrap.querySelector<HTMLElement>('#introCancel')!.onclick = cancel;
  wrap.querySelector<HTMLElement>('#introGo')!.onclick = () => {
    wrap.remove();
    onGo(); // داخل نقرة المستخدم: شرط ظهور نافذة الإذن
  };
  wrap.querySelector<HTMLElement>('#introGo')!.focus();
}
