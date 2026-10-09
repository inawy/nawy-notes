import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from '../../src/lib/prefs';

describe('prefs', () => {
  it('الافتراضي عند null أو تالف أو غير كائن', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{bad')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('5')).toEqual(DEFAULT_PREFS);
  });
  it('يتجاهل القيم غير المعروفة ويقبل الصحيحة جزئياً', () => {
    expect(parsePrefs('{"sort":"x","dir":"asc","layout":"zzz"}')).toEqual({ ...DEFAULT_PREFS, dir: 'asc' });
  });
  it('ذهاب وإياب', () => {
    const p = { sort: 'updated', dir: 'asc', layout: 'list' } as const;
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
  });
});
