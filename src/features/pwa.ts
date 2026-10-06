import { registerSW } from 'virtual:pwa-register';
import { $ } from '../lib/util';
import { toast } from '../lib/toast';
import { createInstaller, IOS_HELP, type InstallState } from '../pwa/install';
import { flushEditor } from '../editor';

/** تثبيت التطبيق + تحديثه. لا نعيد التحميل وسط الكتابة: المستخدم يقرر. */
export function mountPwa(): void {
  const installer = createInstaller(window, (st: InstallState) => {
    $('#btnInstall').hidden = st === 'hidden';
  });
  installer.refresh();
  $('#btnInstall').onclick = async () => {
    const r = await installer.install();
    if (r === 'ios-help') toast(IOS_HELP);
    else if (r === 'accepted') toast('جارٍ تثبيت ناوي نوت…');
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => ($('#updateBar').hidden = false),
    onOfflineReady: () => toast('جاهز للعمل بدون إنترنت'),
  });
  $('#updateNow').onclick = async () => {
    await flushEditor(); // لا يضيع شيء مما يُكتب
    await updateSW(true);
  };
  $('#updateLater').onclick = () => ($('#updateBar').hidden = true);

  // تخزين دائم: يمنع المتصفح من مسح البيانات تحت ضغط المساحة
  void navigator.storage?.persist?.();
}
