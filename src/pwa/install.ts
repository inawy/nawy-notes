/**
 * منطق زر «تثبيت ناوي نوت» — بلا اعتماد على DOM حتى يمكن اختباره بـ node:test.
 *  - Chromium/Android: نحفظ حدث beforeinstallprompt ونستدعي prompt() عند الضغط.
 *  - iOS/iPadOS: لا يوجد beforeinstallprompt؛ نُظهر الزر ونعرض تعليمات Safari.
 *  - مثبّت أصلاً (standalone): لا يظهر الزر.
 */
export type InstallState = 'hidden' | 'prompt' | 'ios';
export type InstallResult = 'accepted' | 'dismissed' | 'ios-help' | 'unavailable';

export const IOS_HELP = 'في Safari: اضغط مشاركة ثم إضافة إلى الشاشة الرئيسية';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** الجزء من window الذي نحتاجه (يسهّل المحاكاة في الاختبار). */
export interface InstallEnv {
  addEventListener(type: string, fn: (e: Event) => void): void;
  matchMedia?(q: string): { matches: boolean };
  navigator: { userAgent: string; platform?: string; maxTouchPoints?: number; standalone?: boolean };
}

/** iPhone/iPad (بما فيها iPadOS 13+ التي تعرّف نفسها كـ Mac بلمس متعدد). */
export function isIOS(nav: InstallEnv['navigator']): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

export function isStandalone(env: InstallEnv): boolean {
  if (env.navigator.standalone === true) return true; // iOS
  try {
    return !!(
      env.matchMedia?.('(display-mode: standalone)').matches ||
      env.matchMedia?.('(display-mode: fullscreen)').matches ||
      env.matchMedia?.('(display-mode: minimal-ui)').matches
    );
  } catch {
    return false;
  }
}

export function createInstaller(env: InstallEnv, onChange: (s: InstallState) => void) {
  let deferred: InstallPromptEvent | null = null;
  let installed = isStandalone(env);
  const ios = isIOS(env.navigator);

  const state = (): InstallState => {
    if (installed) return 'hidden';
    if (deferred) return 'prompt';
    return ios ? 'ios' : 'hidden';
  };
  const emit = () => onChange(state());

  env.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // نتحكم في التوقيت بدل شريط المتصفح التلقائي
    deferred = e as InstallPromptEvent;
    emit();
  });
  env.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });

  return {
    state,
    refresh: emit,
    async install(): Promise<InstallResult> {
      if (deferred) {
        const ev = deferred;
        deferred = null; // الحدث يُستعمل مرة واحدة فقط
        try {
          await ev.prompt();
          const { outcome } = await ev.userChoice;
          if (outcome === 'accepted') installed = true;
          emit();
          return outcome;
        } catch {
          emit();
          return 'unavailable';
        }
      }
      if (state() === 'ios') return 'ios-help';
      return 'unavailable';
    },
  };
}
