import { getStroke } from 'perfect-freehand';
import type { Drawing, Pt, Stroke } from '../types';

export const PEN_COLORS = ['ink', '#ef4444', '#2563eb', '#16a34a', '#f59e0b'] as const;
export const PEN_SIZES = [5, 9, 16] as const;

function outlineToPath(points: number[][]): string {
  if (points.length < 2) return '';
  const [fx = 0, fy = 0] = points[0] ?? [];
  let d = `M ${fx.toFixed(1)} ${fy.toFixed(1)} Q`;
  for (let i = 0; i < points.length; i++) {
    const [x0 = 0, y0 = 0] = points[i] ?? [];
    const [x1 = 0, y1 = 0] = points[(i + 1) % points.length] ?? [];
    d += ` ${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
  }
  return d + ' Z';
}

/** يحوّل ضربة قلم إلى مسار SVG ناعم (نفس المسار يُستخدم في الكانفاس والمعاينة). */
export function strokePath(s: Stroke): string {
  const outline = getStroke(s.points, {
    size: s.size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !s.pen,
    last: true,
  });
  return outlineToPath(outline);
}

const inkFill = (c: string) => (c === 'ink' ? 'currentColor' : c);

/** معاينة SVG مقصوصة على حدود الرسم (لبطاقات الشاشة الرئيسية). */
export function drawingPreviewSvg(d: Drawing): string {
  if (!d.strokes.length) return '';
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxSize = 0;
  for (const s of d.strokes) {
    maxSize = Math.max(maxSize, s.size);
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const pad = maxSize + 10;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const w = Math.max(40, Math.min(d.width, maxX + pad) - x);
  const h = Math.max(40, Math.min(d.height, maxY + pad) - y);
  const paths = d.strokes.map((s) => `<path d="${strokePath(s)}" fill="${inkFill(s.color)}"/>`).join('');
  return `<svg viewBox="${x.toFixed(0)} ${y.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" class="w-full h-auto" role="img" aria-label="رسم">${paths}</svg>`;
}

export type Tool = 'pen' | 'eraser';

export class DrawingBoard {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawing: Drawing;
  private onChange: () => void;
  private cur: Stroke | null = null;
  private erasing = false;
  private undoStack: Stroke[][] = [];

  tool: Tool = 'pen';
  color: string = 'ink';
  size: number = PEN_SIZES[0];

  constructor(canvas: HTMLCanvasElement, drawing: Drawing, onChange: () => void) {
    this.canvas = canvas;
    this.drawing = drawing;
    this.onChange = onChange;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = drawing.width * dpr;
    canvas.height = drawing.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D غير مدعوم');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx = ctx;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    this.redraw();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  private toLocal(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * this.drawing.width) / r.width;
    const y = ((e.clientY - r.top) * this.drawing.height) / r.height;
    return [x, y, e.pressure || 0.5];
  }

  private pushUndo() {
    this.undoStack.push([...this.drawing.strokes]);
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  private down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.toLocal(e);
    if (this.tool === 'eraser') {
      this.pushUndo();
      this.erasing = true;
      this.eraseAt(p);
    } else {
      this.cur = { points: [p], color: this.color, size: this.size, pen: e.pointerType === 'pen' };
      this.redraw();
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.cur && !this.erasing) return;
    const events = e.getCoalescedEvents?.() ?? [];
    const list = events.length ? events : [e];
    for (const ev of list) {
      const p = this.toLocal(ev);
      if (this.erasing) this.eraseAt(p);
      else this.cur?.points.push(p);
    }
    if (this.cur) this.redraw();
  };

  private up = (e: PointerEvent) => {
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (this.cur) {
      const only = this.cur.points[0];
      if (this.cur.points.length === 1 && only) {
        const [x, y, p] = only;
        this.cur.points.push([x + 0.01, y, p]); // نقطة واحدة = دائرة صغيرة
      }
      this.pushUndo();
      this.drawing.strokes.push(this.cur);
      this.cur = null;
      this.redraw();
      this.onChange();
    }
    if (this.erasing) {
      this.erasing = false;
      this.onChange();
    }
  };

  private eraseAt([x, y]: Pt) {
    const r2 = 16 * 16;
    const before = this.drawing.strokes.length;
    this.drawing.strokes = this.drawing.strokes.filter(
      (s) => !s.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < r2),
    );
    if (this.drawing.strokes.length !== before) this.redraw();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.drawing.strokes = prev;
    this.redraw();
    this.onChange();
  }

  clear() {
    if (!this.drawing.strokes.length) return;
    this.pushUndo();
    this.drawing.strokes = [];
    this.redraw();
    this.onChange();
  }

  redraw() {
    const { ctx, drawing } = this;
    ctx.clearRect(0, 0, drawing.width, drawing.height);
    const ink = getComputedStyle(this.canvas).color;
    const all = this.cur ? [...drawing.strokes, this.cur] : drawing.strokes;
    for (const s of all) {
      const d = strokePath(s);
      if (!d) continue;
      ctx.fillStyle = s.color === 'ink' ? ink : s.color;
      ctx.fill(new Path2D(d));
    }
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
  }
}
