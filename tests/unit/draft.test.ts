import { describe, expect, it } from 'vitest';
import { applyDraft, makeDraft, needsRecovery, parseDraft } from '../../src/lib/draft';
import { formatUsage, isQuotaError } from '../../src/lib/storage-errors';

const note = { id: 'a', type: 'text' as const, title: 'ع', body: 'نص', items: [] };

describe('draft', () => {
  it('makeDraft: فارغ أو ضخم => null', () => {
    expect(makeDraft({ ...note, title: '', body: '' }, 1)).toBeNull();
    expect(makeDraft({ ...note, body: 'x'.repeat(200_001) }, 1)).toBeNull();
    expect(makeDraft(note, 5)?.savedAt).toBe(5);
  });
  it('parseDraft يرفض التالف ويقبل الصحيح', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('{bad')).toBeNull();
    expect(parseDraft('{"id":1}')).toBeNull();
    const d = makeDraft(note, 7)!;
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });
  it('needsRecovery: فقط إن كانت أحدث من المحفوظ', () => {
    const d = makeDraft(note, 100)!;
    expect(needsRecovery(d, undefined)).toBe(true);
    expect(needsRecovery(d, 50)).toBe(true);
    expect(needsRecovery(d, 100)).toBe(false);
    expect(needsRecovery(d, 200)).toBe(false);
  });
  it('applyDraft يدمج النص ويحافظ على بقية الحقول', () => {
    const d = makeDraft({ ...note, body: 'جديد' }, 1)!;
    const r = applyDraft({ ...note, color: 'red' }, d);
    expect(r.body).toBe('جديد');
    expect(r.color).toBe('red');
  });
});

describe('storage-errors', () => {
  it('isQuotaError يكشف الأنواع والمغلّف', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(isQuotaError({ message: 'The quota has been exceeded' })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
  it('formatUsage', () => {
    expect(formatUsage(undefined, 10)).toBe('');
    expect(formatUsage(1048576 * 5, 1048576 * 100)).toContain('5٪');
  });
});
