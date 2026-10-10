import { expect, test } from '@playwright/test';

// هنا نسمح بعامل الخدمة الحقيقي (بقية الاختبارات تحجبه) لنتأكد أن سياسة الأمان لا تكسر التسجيل ولا العمل دون اتصال.
test.use({ serviceWorkers: 'allow' });

test('PWA: عامل الخدمة يعمل مع CSP والتطبيق يُفتح بلا إنترنت بعد إعادة التحميل', async ({ page, context }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });

  await page.goto('./');
  await page.waitForSelector('#fab');
  await page.click('#fab');
  await page.click('#fabMenu [data-type="text"]');
  await page.fill('#eTitle', 'تعمل بدون شبكة');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // الآن تحت سيطرة عامل الخدمة
  await page.waitForSelector('#fab');
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#fab');
  await expect(page.locator('.note-card')).toContainText('تعمل بدون شبكة');
  expect(violations).toEqual([]);
});
