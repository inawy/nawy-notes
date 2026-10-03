import { esc } from './util';
import { isIOS, isStandalone } from '../pwa/install';

/** خطوات تفعيل الميكروفون بحسب الجهاز (المتصفح لا يسمح بإعادة طلب الإذن بعد رفضه). */
export function micSteps(ua: string, installed: boolean, ios: boolean): string[] {
  if (ios) return ['افتح «الإعدادات» في الجهاز', 'اختر Safari ثم «الميكروفون»', 'اختر «السؤال» أو «السماح» ثم عُد إلى ناوي نوت'];
  if (/Android/i.test(ua)) {
    return installed
      ? ['افتح متصفح Chrome ثم ⋮ ثم «الإعدادات» ثم «إعدادات الموقع» ثم «الميكروفون»', 'ابحث عن موقع ناوي نوت (inawy.github.io) واختر «سماح»', 'أو من معلومات التطبيق اختر «إعادة ضبط الأذونات» (لا تختر «مسح البيانات» فهو يحذف ملاحظاتك)', 'عُد إلى ناوي نوت']
      : ['اضغط أيقونة القفل 🔒 بجوار عنوان الموقع', 'اختر «الأذونات» ثم «الميكروفون» ثم «سماح»', 'عُد هنا واضغط «إعادة المحاولة»'];
  }
  return ['اضغط أيقونة القفل 🔒 بجوار عنوان الموقع', 'فعّل «الميكروفون» (سماح)', 'اضغط «إعادة المحاولة» (وقد تحتاج لتحديث الصفحة)'];
}

/** نافذة سفلية تشرح كيف يُفعَّل الميكروفون وتتيح إعادة المحاولة. */
export function showMicHelp(onRetry: () => void, onDeviceRecorder?: () => void): void {
  document.getElementById('micHelp')?.remove();
  const steps = micSteps(navigator.userAgent, isStandalone(window), isIOS(navigator));
  const wrap = document.createElement('div');
  wrap.id = 'micHelp';
  wrap.className = 'fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="modal-enter w-full max-w-md rounded-t-2xl bg-white p-5 text-slate-800 shadow-2xl dark:bg-slate-900 dark:text-slate-100 sm:rounded-2xl" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <h2 class="mb-2 text-lg font-semibold">الميكروفون غير مفعّل</h2>
      <p class="mb-3 text-sm text-slate-500 dark:text-slate-400">لم يُمنح إذن الميكروفون لهذا الموقع، والمتصفح لا يسمح للتطبيق بطلبه مرة أخرى بعد الرفض. فعّله من الإعدادات:</p>
      <ol class="mb-4 list-decimal space-y-1.5 ps-5 text-sm">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="flex gap-2">
        <button type="button" id="micRetry" class="btn-primary flex-1">إعادة المحاولة</button>
        <button type="button" id="micClose" class="btn-icon flex-1 !text-slate-600 dark:!text-slate-300">إغلاق</button>
      </div>
      ${onDeviceRecorder ? '<button type="button" id="micDevice" class="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-medium dark:border-slate-700">أو سجّل بمسجّل الجهاز (بدون إذن)</button>' : ''}
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
  wrap.querySelector<HTMLElement>('#micClose')!.onclick = close;
  wrap.querySelector<HTMLElement>('#micRetry')!.onclick = () => {
    close();
    onRetry(); // نقرة مستخدم جديدة: شرط ظهور نافذة الإذن إن كانت الحالة "prompt"
  };
  wrap.querySelector<HTMLElement>('#micRetry')!.focus();
  const dev = wrap.querySelector<HTMLElement>('#micDevice');
  if (dev) dev.onclick = () => {
    close();
    onDeviceRecorder?.(); // داخل نقرة المستخدم: شرط فتح مسجّل الجهاز
  };
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
