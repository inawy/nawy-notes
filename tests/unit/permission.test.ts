import { describe, expect, it } from 'vitest';
import { micSteps } from '../../src/lib/permission';

describe('micSteps (تفعيل الميكروفون بعد الرفض)', () => {
  it('iOS: يذكر Safari', () => {
    expect(micSteps('', false, true).join(' ')).toContain('Safari');
  });
  it('أندرويد مثبّت يختلف عن المتصفح العادي', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/120';
    expect(micSteps(ua, true, false)).not.toEqual(micSteps(ua, false, false));
  });
  it('سطح المكتب: خطوات غير فارغة', () => {
    expect(micSteps('Mozilla/5.0 (Windows NT 10.0)', false, false).length).toBeGreaterThan(0);
  });
});
