/**
 * سحب وإفلات لإعادة ترتيب عناصر شبكة، مبني على أحداث المؤشر (فأرة/لمس/قلم) بلا مكتبات.
 * سبب كتابته: مكتبات الترتيب الجاهزة تفترض اتجاه LTR في الشبكات متعددة الأعمدة فتفشل في RTL
 * (حركات داخل الصف الواحد تُهمَل، والإسقاط غير دقيق). هنا الهدف يُحدَّد بموضع المؤشر داخل
 * مستطيل البطاقة، وهذا لا يتأثر باتجاه الصفحة.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * يُرجع فهرس العنصر الذي يقع المؤشر داخل منطقته الوسطى (بعد تقليص الحواف بنسبة shrink)،
 * أو -1. التقليص يمنع التذبذب عند حدود البطاقات.
 */
export function pickTarget(boxes: Box[], x: number, y: number, shrink = 0.1): number {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const mx = (b.right - b.left) * shrink;
    const my = (b.bottom - b.top) * shrink;
    if (x >= b.left + mx && x <= b.right - mx && y >= b.top + my && y <= b.bottom - my) return i;
  }
  return -1;
}

export interface ReorderOptions {
  /** محدّد العناصر القابلة للسحب (أبناء الحاوية المباشرون). */
  item: string;
  /** عناصر داخل البطاقة لا تبدأ سحباً (أزرار، حقول...). */
  ignore?: string;
  /** مهلة الضغط المطوّل على اللمس قبل بدء السحب (تتيح التمرير بالإصبع). */
  touchDelay?: number;
  onStart?: () => void;
  /** يُستدعى عند الإفلات؛ changed = هل تغيّر الترتيب. */
  onEnd?: (changed: boolean) => void;
}

const MOUSE_SLOP = 5; // px قبل بدء السحب بالفأرة
const TOUCH_SLOP = 10; // حركة أكبر خلال الانتظار = المستخدم يمرّر الصفحة
const EDGE = 70; // منطقة التمرير التلقائي قرب حافة الشاشة
const MAX_SCROLL = 18; // px لكل إطار

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeReorderable(container: HTMLElement, opts: ReorderOptions): () => void {
  const touchDelay = opts.touchDelay ?? 130;
  const items = () => [...container.children].filter((c): c is HTMLElement => c.matches(opts.item));

  let pending: {
    el: HTMLElement;
    id: number;
    x: number;
    y: number;
    touch: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null = null;
  let drag: {
    el: HTMLElement;
    ghost: HTMLElement;
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    fromIndex: number;
    layout: { el: HTMLElement; box: Box }[];
    scrollY: number;
    raf: number;
  } | null = null;

  function measure(): { el: HTMLElement; box: Box }[] {
    return items().map((el) => {
      const r = el.getBoundingClientRect();
      return { el, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
    });
  }

  function cleanupPending() {
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;
    document.removeEventListener('pointermove', onPendingMove);
    document.removeEventListener('pointerup', onPendingEnd);
    document.removeEventListener('pointercancel', onPendingEnd);
  }

  function onPendingMove(e: PointerEvent) {
    if (!pending || e.pointerId !== pending.id) return;
    const moved = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
    if (pending.touch) {
      if (moved > TOUCH_SLOP) cleanupPending(); // تمرير عادي
    } else if (moved >= MOUSE_SLOP) {
      const p = pending;
      cleanupPending();
      begin(p.el, p.id, e.clientX, e.clientY, p.x, p.y);
    }
  }
  function onPendingEnd() {
    cleanupPending();
  }

  function onDown(e: PointerEvent) {
    if (drag || pending) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return;
    const t = e.target as HTMLElement;
    if (opts.ignore && t.closest(opts.ignore)) return;
    const el = t.closest<HTMLElement>(opts.item);
    if (!el || el.parentElement !== container) return;
    const touch = e.pointerType !== 'mouse';
    pending = { el, id: e.pointerId, x: e.clientX, y: e.clientY, touch };
    if (touch) {
      pending.timer = setTimeout(() => {
        const p = pending;
        if (!p) return;
        cleanupPending();
        begin(p.el, p.id, p.x, p.y, p.x, p.y);
      }, touchDelay);
    }
    document.addEventListener('pointermove', onPendingMove);
    document.addEventListener('pointerup', onPendingEnd);
    document.addEventListener('pointercancel', onPendingEnd);
  }

  const blockScroll = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finish(true);
  };
  const suppressClick = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };

  function begin(el: HTMLElement, id: number, x: number, y: number, startX: number, startY: number) {
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-id');
    ghost.removeAttribute('tabindex');
    ghost.classList.add('reorder-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
      zIndex: '100000',
      pointerEvents: 'none',
    });
    document.body.appendChild(ghost);
    el.classList.add('drag-ghost', 'drag-chosen');
    document.body.classList.add('reordering');
    drag = {
      el,
      ghost,
      id,
      startX,
      startY,
      x,
      y,
      fromIndex: items().indexOf(el),
      layout: measure(),
      scrollY: window.scrollY,
      raf: 0,
    };
    move(x, y);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', blockScroll, { passive: false });
    document.addEventListener('keydown', onKey);
    drag.raf = requestAnimationFrame(tick);
    opts.onStart?.();
  }

  function move(x: number, y: number) {
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    drag.ghost.style.transform = `translate3d(${x - drag.startX}px, ${y - drag.startY}px, 0) scale(1.03)`;
    retarget();
  }

  /** يحدّد البطاقة تحت المؤشر ويبدّل مكان العنصر المسحوب معها. */
  function retarget() {
    if (!drag) return;
    const dy = window.scrollY - drag.scrollY; // التمرير منذ آخر قياس
    const boxes = drag.layout.map(({ box }) => ({
      left: box.left,
      right: box.right,
      top: box.top - dy,
      bottom: box.bottom - dy,
    }));
    const i = pickTarget(boxes, drag.x, drag.y);
    if (i < 0) return;
    const target = drag.layout[i].el;
    if (target === drag.el) return;
    const order = items();
    const to = order.indexOf(target);
    const from = order.indexOf(drag.el);
    const before = new Map(order.map((el) => [el, el.getBoundingClientRect()]));
    order.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    if (from < to) target.after(drag.el);
    else target.before(drag.el);
    drag.layout = measure();
    drag.scrollY = window.scrollY;
    if (reduced()) return;
    for (const { el, box } of drag.layout) {
      const b = before.get(el);
      if (!b) continue;
      const dx = b.left - box.left;
      const dyy = b.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dyy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dyy}px)` }, { transform: 'none' }], {
        duration: 190,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
  }

  function tick() {
    if (!drag) return;
    const h = window.innerHeight;
    let v = 0;
    if (drag.y < EDGE) v = -MAX_SCROLL * (1 - drag.y / EDGE);
    else if (drag.y > h - EDGE) v = MAX_SCROLL * (1 - (h - drag.y) / EDGE);
    if (v) {
      window.scrollBy(0, v);
      retarget();
    }
    drag.raf = requestAnimationFrame(tick);
  }

  const onMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) move(e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) finish(false);
  };
  const onCancel = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) finish(true);
  };

  function finish(cancelled: boolean) {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', blockScroll);
    document.removeEventListener('keydown', onKey);
    if (cancelled) {
      const order = items().filter((el) => el !== d.el);
      const ref = order[d.fromIndex];
      if (ref) ref.before(d.el);
      else container.appendChild(d.el);
    }
    const changed = items().indexOf(d.el) !== d.fromIndex;
    // الإفلات: يهبط الظل في مكان الخانة ثم يُزال
    const end = d.el.getBoundingClientRect();
    const done = () => {
      d.ghost.remove();
      d.el.classList.remove('drag-ghost', 'drag-chosen');
      document.body.classList.remove('reordering');
    };
    opts.onEnd?.(changed); // الحفظ فوراً، لا ننتظر حركة الهبوط
    if (reduced()) {
      done();
    } else {
      const a = d.ghost.animate(
        [
          { transform: d.ghost.style.transform },
          { transform: `translate3d(${end.left - parseFloat(d.ghost.style.left)}px, ${end.top - parseFloat(d.ghost.style.top)}px, 0) scale(1)` },
        ],
        { duration: 140, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
      );
      a.onfinish = done;
      a.oncancel = done;
    }
    // نقرة الإفلات لا تفتح الملاحظة
    window.addEventListener('click', suppressClick, true);
    setTimeout(() => window.removeEventListener('click', suppressClick, true), 150);
  }

  container.addEventListener('pointerdown', onDown);
  return () => {
    container.removeEventListener('pointerdown', onDown);
    cleanupPending();
    if (drag) finish(true);
  };
}
