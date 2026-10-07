const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
}

/**
 * يحبس التركيز (Tab / Shift+Tab) داخل نافذة حوارية ويعيده لما كان عليه عند الإغلاق.
 * Esc يستدعي onEscape إن مُرّر. يعيد دالة الإلغاء.
 */
export function trapFocus(root: HTMLElement, opts: { onEscape?: () => void; initial?: HTMLElement | null } = {}): () => void {
  const before = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.onEscape) {
      e.preventDefault();
      opts.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables(root);
    if (!list.length) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  // التركيز الأولي بعد أن يصبح العنصر ظاهراً
  queueMicrotask(() => (opts.initial ?? focusables(root)[0])?.focus({ preventScroll: true }));
  return () => {
    document.removeEventListener('keydown', onKey);
    if (before && document.contains(before)) before.focus({ preventScroll: true });
  };
}
