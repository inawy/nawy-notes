import { describe, expect, it } from 'vitest';
import {
  AUTO_INTERVAL_MS,
  chooseMode,
  formatBytes,
  FULL_MAX_BLOB_BYTES,
  pickPrune,
  shouldAutoSnapshot,
} from '../../src/lib/snapshot-policy';

const base = { now: 10 * AUTO_INTERVAL_MS, dataUpdatedAt: 500, liveCount: 3 };

describe('shouldAutoSnapshot', () => {
  it('لا لقطة بلا ملاحظات حيّة', () => {
    expect(shouldAutoSnapshot({ ...base, liveCount: 0 })).toBe(false);
  });
  it('أول لقطة تُؤخذ فوراً', () => {
    expect(shouldAutoSnapshot(base)).toBe(true);
  });
  it('لا لقطة إن لم يتغيّر شيء منذ آخر لقطة', () => {
    expect(shouldAutoSnapshot({ ...base, lastCreatedAt: 0, lastDataUpdatedAt: 500 })).toBe(false);
  });
  it('لا لقطة قبل مضي 24 ساعة حتى مع تغيّر', () => {
    const lastCreatedAt = base.now - AUTO_INTERVAL_MS + 1000;
    expect(shouldAutoSnapshot({ ...base, lastCreatedAt, lastDataUpdatedAt: 100 })).toBe(false);
  });
  it('لقطة بعد 24 ساعة مع تغيّر', () => {
    const lastCreatedAt = base.now - AUTO_INTERVAL_MS;
    expect(shouldAutoSnapshot({ ...base, lastCreatedAt, lastDataUpdatedAt: 100 })).toBe(true);
  });
});

describe('pickPrune', () => {
  it('يُبقي الأحدث ويحذف الأقدم', () => {
    const list = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `s${n}`, createdAt: n }));
    expect(pickPrune(list, 5).sort()).toEqual(['s1', 's2']);
    expect(pickPrune(list.slice(0, 3), 5)).toEqual([]);
  });
});

describe('chooseMode', () => {
  it('كاملة عند الصغر', () => expect(chooseMode(1000, 1e6, 1e9)).toBe('full'));
  it('خفيفة عند ضخامة المرفقات', () => expect(chooseMode(FULL_MAX_BLOB_BYTES + 1)).toBe('lite'));
  it('خفيفة عند اقتراب السعة', () => expect(chooseMode(20e6, 780e6, 1000e6)).toBe('lite'));
  it('كاملة إن لم تتوفر تقديرات السعة', () => expect(chooseMode(5e6)).toBe('full'));
});

describe('formatBytes', () => {
  it('وحدات مقروءة', () => {
    expect(formatBytes(500)).toBe('500 ب');
    expect(formatBytes(2048)).toBe('2 ك.ب');
    expect(formatBytes(5 * 1048576)).toBe('5.0 م.ب');
  });
});
