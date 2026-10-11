import { describe, expect, it } from 'vitest';
import { planHasChanges, planImport } from '../../src/data/import-plan';

const ex = (rows: [string, number, string][]) => new Map(rows.map(([id, updatedAt, status]) => [id, { updatedAt, status }]));

describe('planImport', () => {
  it('جديدة وتحديث وبلا تغيير وأقدم', () => {
    const p = planImport(
      [
        { id: 'new', updatedAt: 5, status: 'active', title: 'جديدة' },
        { id: 'upd', updatedAt: 9, status: 'active', title: 'محدّثة' },
        { id: 'same', updatedAt: 3, status: 'active' },
        { id: 'old', updatedAt: 1, status: 'active' },
      ],
      ex([
        ['upd', 4, 'active'],
        ['same', 3, 'active'],
        ['old', 8, 'active'],
      ]),
    );
    expect(p).toMatchObject({ total: 4, add: 1, update: 1, remove: 0, same: 1, older: 1, ignored: 0 });
    expect(p.samples).toEqual([
      { kind: 'add', title: 'جديدة' },
      { kind: 'update', title: 'محدّثة' },
    ]);
    expect(planHasChanges(p)).toBe(true);
  });

  it('شاهد حذف أحدث يحذف ملاحظة حيّة؛ وبلا مقابل حيّ لا أثر له', () => {
    const p = planImport(
      [
        { id: 'a', updatedAt: 10, status: 'deleted', title: 'ستُحذف' },
        { id: 'b', updatedAt: 10, status: 'deleted' },
        { id: 'c', updatedAt: 10, status: 'deleted' },
      ],
      ex([
        ['a', 5, 'active'],
        ['c', 5, 'deleted'],
      ]),
    );
    expect(p).toMatchObject({ remove: 1, ignored: 2, add: 0, update: 0 });
    expect(p.samples).toEqual([{ kind: 'remove', title: 'ستُحذف' }]);
  });

  it('ملاحظة حيّة أحدث من شاهد حذف موجود تُضاف (تتفوّق عليه)', () => {
    const p = planImport([{ id: 'x', updatedAt: 9, status: 'active', title: 'x' }], ex([['x', 4, 'deleted']]));
    expect(p.add).toBe(1);
  });

  it('عنوان فارغ يأخذ نصاً بديلاً، والعيّنة محدودة بـ5 لكل نوع', () => {
    const inc = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, updatedAt: 1, status: 'active', title: i === 0 ? '  ' : `t${i}` }));
    const p = planImport(inc, new Map());
    expect(p.add).toBe(8);
    expect(p.samples).toHaveLength(5);
    expect(p.samples[0]?.title).toBe('(بلا عنوان)');
  });

  it('لا تغييرات حين كل شيء مطابق أو أقدم', () => {
    const p = planImport([{ id: 'a', updatedAt: 1 }], ex([['a', 2, 'active']]));
    expect(planHasChanges(p)).toBe(false);
  });
});
