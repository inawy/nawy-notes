import { expect, test, type Page } from '@playwright/test';

/** اختبار أداء بـ 5000 ملاحظة. الميزانيات سخيّة (CI أبطأ من جهاز المستخدم) وتكشف الانحدار الكبير فقط. */
const N = 5000;
const BUDGET = { firstCards: Number(process.env.PERF_FIRST ?? 1), search: Number(process.env.PERF_SEARCH ?? 1) };

async function seed(page: Page) {
  await page.goto('./');
  await page.waitForSelector('#fab');
  await page.evaluate(async (n) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('nawy-note-db');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction('notes', 'readwrite');
    const st = tx.objectStore('notes');
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      const list = i % 5 === 0;
      const draw = i % 40 === 0;
      st.put({
        id: `perf-${i}`,
        type: list ? 'list' : 'text',
        title: `ملاحظة رقم ${i} للاختبار`,
        body: list ? '' : `نص تجريبي طويل نسبياً للملاحظة ${i} `.repeat(6),
        items: list ? Array.from({ length: 5 }, (_, k) => ({ id: `i${k}`, text: `بند ${k} من ${i}`, done: k % 2 === 0 })) : [],
        attachments: draw
          ? [{ id: `d${i}`, kind: 'draw', drawing: { width: 300, height: 200, strokes: [{ points: [[1, 1, 0.5], [50, 60, 0.5], [90, 20, 0.5]], color: 'ink', size: 5, pen: false }] } }]
          : [],
        color: 'default',
        order: i,
        pinned: i % 100 === 0,
        status: 'active',
        createdAt: now - i * 1000,
        updatedAt: now - i * 1000,
        trashedAt: null,
      });
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, N);
}

test(`أداء: ${N} ملاحظة — أول رسم والبحث`, async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  const t0 = Date.now();
  await page.reload();
  await page.waitForSelector('.note-card');
  const first = Date.now() - t0;
  // التحميل تدريجي: نمرّر للأسفل حتى تظهر كل البطاقات
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        return page.locator('.note-card').count();
      },
      { timeout: 60_000, intervals: [100] },
    )
    .toBe(N);
  const all = Date.now() - t0;

  const marks = await page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .filter((m) => m.name.startsWith('nawy:'))
      .map((m) => `${m.name}=${Math.round(m.duration)}ms`),
  );

  const s0 = Date.now();
  await page.fill('#search', 'رقم 4999');
  await expect(page.locator('.note-card')).toHaveCount(1, { timeout: 15_000 });
  const search = Date.now() - s0;

  const report = JSON.stringify({ first, all, search, marks });
  console.log(`PERF ${report}`);
  expect(first, report).toBeLessThan(BUDGET.firstCards);
  expect(search, report).toBeLessThan(BUDGET.search);
});
