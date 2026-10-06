import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInstaller, isIOS, isStandalone, type InstallEnv } from '../src/pwa/install.ts';

function fakeEnv(nav: Partial<InstallEnv['navigator']> = {}, standalone = false) {
  const h: Record<string, (e: Event) => void> = {};
  const env: InstallEnv = {
    addEventListener: (t, fn) => void (h[t] = fn),
    matchMedia: (q) => ({ matches: standalone && q.includes('standalone') }),
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120', ...nav },
  };
  return { env, h };
}
const bip = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
  let prevented = false,
    prompted = 0;
  return {
    preventDefault: () => void (prevented = true),
    prompt: async () => void prompted++,
    userChoice: Promise.resolve({ outcome }),
    get prevented() {
      return prevented;
    },
    get prompted() {
      return prompted;
    },
  };
};

test('Chromium: يخفي الزر حتى يصل beforeinstallprompt ثم يستدعي prompt()', async () => {
  const { env, h } = fakeEnv();
  const states: string[] = [];
  const inst = createInstaller(env, (s) => states.push(s));
  assert.equal(inst.state(), 'hidden');
  const ev = bip();
  h.beforeinstallprompt(ev as unknown as Event);
  assert.equal(ev.prevented, true);
  assert.equal(inst.state(), 'prompt');
  assert.equal(await inst.install(), 'accepted');
  assert.equal(ev.prompted, 1);
  assert.equal(inst.state(), 'hidden');
  assert.equal(await inst.install(), 'unavailable');
});

test('رفض التثبيت: يخفي الزر حتى يُطلق المتصفح الحدث من جديد', async () => {
  const { env, h } = fakeEnv();
  const inst = createInstaller(env, () => {});
  h.beforeinstallprompt(bip('dismissed') as unknown as Event);
  assert.equal(await inst.install(), 'dismissed');
  assert.equal(inst.state(), 'hidden');
  h.beforeinstallprompt(bip() as unknown as Event);
  assert.equal(inst.state(), 'prompt');
});

test('appinstalled يخفي الزر', () => {
  const { env, h } = fakeEnv();
  const inst = createInstaller(env, () => {});
  h.beforeinstallprompt(bip() as unknown as Event);
  h.appinstalled({} as Event);
  assert.equal(inst.state(), 'hidden');
});

test('iPhone: يظهر الزر ويعيد تعليمات Safari', async () => {
  const { env } = fakeEnv({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari' });
  const inst = createInstaller(env, () => {});
  assert.equal(inst.state(), 'ios');
  assert.equal(await inst.install(), 'ios-help');
});

test('iPadOS (يعرّف نفسه كـ Mac) يُكتشف بعدد نقاط اللمس', () => {
  assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
});

test('مثبّت أصلاً: لا زر (standalone و iOS standalone)', () => {
  const a = fakeEnv({}, true);
  assert.equal(isStandalone(a.env), true);
  assert.equal(createInstaller(a.env, () => {}).state(), 'hidden');
  const b = fakeEnv({ userAgent: 'iPhone', standalone: true });
  assert.equal(createInstaller(b.env, () => {}).state(), 'hidden');
});

test('سطح المكتب بلا حدث: لا زر', () => {
  assert.equal(createInstaller(fakeEnv().env, () => {}).state(), 'hidden');
});
