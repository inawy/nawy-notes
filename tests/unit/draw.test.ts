import { describe, expect, it } from 'vitest';
import { drawingPreviewSvg, HIGHLIGHTER_ALPHA, PEN_COLORS, SIZE_MAX, SIZE_MIN, strokePath } from '../../src/lib/draw';
import type { Drawing, Stroke } from '../../src/types';

const pts: Stroke['points'] = [
  [10, 10, 0.5],
  [60, 40, 0.5],
  [120, 20, 0.5],
];
const pen: Stroke = { points: pts, color: '#ef4444', size: 5, pen: false };
const hl: Stroke = { points: pts, color: '#facc15', size: 13, pen: false, hl: true };

describe('draw', () => {
  it('لوحة الألوان: حبر متكيّف + ألوان hex صالحة بلا تكرار', () => {
    expect(PEN_COLORS[0]).toBe('ink');
    const hex = PEN_COLORS.filter((c) => c !== 'ink');
    expect(hex.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    expect(new Set(PEN_COLORS).size).toBe(PEN_COLORS.length);
    expect(SIZE_MIN).toBeLessThan(SIZE_MAX);
  });
  it('strokePath يعيد مساراً للضربتين العادية والمظلِّل', () => {
    expect(strokePath(pen)).toMatch(/^M .* Z$/);
    expect(strokePath(hl)).toMatch(/^M .* Z$/);
  });
  it('المعاينة تُلوّن المظلِّل بشفافية والقلم بلا شفافية، والملفات القديمة بلا hl تعمل', () => {
    const d: Drawing = { width: 900, height: 600, strokes: [pen, hl] };
    const svg = drawingPreviewSvg(d);
    expect(svg.match(/<path /g)?.length).toBe(2);
    expect(svg).toContain(`fill-opacity="${HIGHLIGHTER_ALPHA}"`);
    expect(svg.match(/fill-opacity/g)?.length).toBe(1);
    expect(drawingPreviewSvg({ ...d, strokes: [] })).toBe('');
  });
});
