import { afterEach, describe, expect, it, vi } from 'vitest';
import { countNotes, debounce, esc, normalize } from '../../src/lib/util';

describe('esc', () => {
  it('يهرّب رموز HTML الخمسة', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('normalize (بحث عربي)', () => {
  it('يوحّد الهمزات والتاء المربوطة والألف المقصورة', () => {
    expect(normalize('أحمد')).toBe(normalize('احمد'));
    expect(normalize('مدرسة')).toBe(normalize('مدرسه'));
    expect(normalize('على')).toBe(normalize('علي'));
  });
  it('يتجاهل التشكيل والتطويل', () => {
    expect(normalize('مُحَمَّد')).toBe(normalize('محمد'));
    expect(normalize('كتـــاب')).toBe(normalize('كتاب'));
  });
  it('غير حساس لحالة الأحرف اللاتينية', () => {
    expect(normalize('NaWy')).toBe('nawy');
  });
});

describe('debounce', () => {
  afterEach(() => vi.useRealTimers());

  it('ينفّذ آخر استدعاء فقط بعد المهلة', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('cancel يلغي التنفيذ المعلّق', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('countNotes (تصريف عربي)', () => {
  it('يصرّف العدد', () => {
    expect(countNotes(0)).toBe('لا ملاحظات');
    expect(countNotes(1)).toBe('ملاحظة واحدة');
    expect(countNotes(2)).toBe('ملاحظتان');
    expect(countNotes(5)).toContain('ملاحظات');
    expect(countNotes(11)).toContain('ملاحظة');
    expect(countNotes(11)).not.toContain('ملاحظات');
  });
});
