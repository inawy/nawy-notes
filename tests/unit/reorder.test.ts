import { describe, expect, it } from 'vitest';
import { pickTarget, type Box } from '../../src/lib/reorder';

// شبكة 3 أعمدة بترتيب RTL: العنصر 0 في أقصى اليمين
const box = (col: number, row: number): Box => ({
  left: 300 - col * 100 - 100 + 100,
  right: 300 - col * 100 + 100,
  top: row * 100,
  bottom: row * 100 + 90,
});
const boxes = [box(0, 0), box(1, 0), box(2, 0), box(0, 1)];

describe('pickTarget (هدف الإسقاط بموضع المؤشر)', () => {
  it('يجد البطاقة تحت المؤشر داخل الصف الواحد (يمين ويسار)', () => {
    const c = (i: number) => [(boxes[i].left + boxes[i].right) / 2, (boxes[i].top + boxes[i].bottom) / 2];
    for (let i = 0; i < boxes.length; i++) expect(pickTarget(boxes, c(i)[0], c(i)[1])).toBe(i);
  });
  it('يتجاهل الحواف (تقليص 10%) لمنع التذبذب', () => {
    const b = boxes[0];
    expect(pickTarget(boxes, b.right - 1, (b.top + b.bottom) / 2)).toBe(-1);
  });
  it('خارج كل البطاقات = -1', () => {
    expect(pickTarget(boxes, 5000, 5000)).toBe(-1);
  });
});
