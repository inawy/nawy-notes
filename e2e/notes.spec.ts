import { expect, test, type Page } from '@playwright/test';

const EVIL = '"><img src=x onerror=window.__x=1>&<b>';

async function open(page: Page) {
  await page.goto('./');
  await page.waitForSelector('#fab');
}

async function newNote(page: Page, type: 'text' | 'list') {
  await page.click('#fab');
  await page.click(`#fabMenu [data-type="${type}"]`);
  await page.waitForSelector('#eTitle');
}

test('ملاحظة نصية تُحفظ وتبقى بعد إعادة التحميل', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'خطة الأسبوع');
  await page.fill('#eText', 'مراجعة ما تم');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');
  await expect(page.locator('.note-card')).toHaveCount(1);

  await page.reload();
  await page.waitForSelector('#fab');
  await expect(page.locator('.note-card')).toContainText('خطة الأسبوع');
});

test('النص الخبيث يظهر حرفياً ولا يُنفَّذ (بطاقة وقارئ ومحرّر)', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', EVIL);
  await page.fill('#eText', EVIL);
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');

  await expect(page.locator('.note-card').first()).toContainText(EVIL);
  await page.locator('.note-card').first().click();
  await expect(page.locator('#rContent')).toContainText(EVIL);
  await page.click('#rEdit');
  await expect(page.locator('#eTitle')).toHaveValue(EVIL);
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test('الأرشفة مع تراجع', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'للأرشفة');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eArchive');
  await expect(page.locator('.note-card')).toHaveCount(0);
  await page.click('#toast button');
  await expect(page.locator('.note-card')).toHaveCount(1);
});

/**
 * ترحيل البيانات: قاعدة بالنسخة 1 (قبل المرفقات، ونوع draw القديم) تُفتح بالتطبيق الحالي
 * دون فقدان. Dexie يضرب رقم النسخة في 10 داخل IndexedDB.
 */
test('ترحيل: قاعدة قديمة (v1) تُفتح وتظهر ملاحظاتها', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('nawy-note-db');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open('nawy-note-db', 10);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('notes', { keyPath: 'id' });
        for (const k of ['status', 'pinned', 'updatedAt', 'trashedAt']) s.createIndex(k, k);
        const now = Date.now();
        const base = { color: 'default', pinned: 0, status: 'active', createdAt: now, updatedAt: now, trashedAt: null };
        s.put({ ...base, id: 'old-text', type: 'text', title: 'ملاحظة قديمة', body: 'نص' }); // بلا items/attachments
        s.put({
          ...base,
          id: 'old-draw',
          type: 'draw',
          title: 'رسم قديم',
          body: '',
          items: [],
          drawing: { width: 100, height: 100, strokes: [] },
        });
      };
      r.onsuccess = () => {
        r.result.close();
        res();
      };
      r.onerror = () => rej(r.error);
    });
  });

  await page.reload();
  await page.waitForSelector('#fab');
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.locator('.note-card', { hasText: 'ملاحظة قديمة' })).toBeVisible();
  await page.locator('.note-card', { hasText: 'ملاحظة قديمة' }).click();
  await expect(page.locator('#rContent')).toContainText('نص');
});

test('ألوان العلامة: لا رموز {{brand}} متبقية والخلفية من brand.json', async ({ page }) => {
  const res = await page.goto('./');
  expect(await res!.text()).not.toContain('{{brand');
  await page.waitForSelector('#fab');
  const css = await page.evaluate(async () => {
    const hrefs = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => (l as HTMLLinkElement).href);
    return (await Promise.all(hrefs.map((h) => fetch(h).then((r) => r.text())))).join('\n');
  });
  expect(css).not.toContain('{{brand');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(248, 250, 252)');
  expect(await page.getAttribute('meta[name=theme-color]', 'content')).toBe('#f8fafc');
});

test('الحذف النهائي يترك شاهد حذف بلا محتوى ولا يظهر في أي عرض', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'سيُحذف');
  await page.fill('#eText', 'سري');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eTrash');
  await expect(page.locator('.note-card')).toHaveCount(0);

  await page.click('#btnMenu');
  await page.click('#tabs [data-view="trash"]');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.click('[data-act="purge"]');
  await expect(page.locator('.note-card')).toHaveCount(0);

  const rows = await page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((res, rej) => {
        const r = indexedDB.open('nawy-note-db');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const q = r.result.transaction('notes').objectStore('notes').getAll();
          q.onsuccess = () => res(q.result);
        };
      }),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: 'deleted', title: '', body: '' });
  expect(typeof rows[0].deletedAt).toBe('number');
  expect(JSON.stringify(rows[0])).not.toContain('سري');
});

test('الوصولية: القائمة تحبس التركيز، وEsc يغلقها ويعيد التركيز للزر', async ({ page }) => {
  await open(page);
  await page.click('#btnMenu');
  await expect(page.locator('#drawerRoot')).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#drawer'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#drawerRoot')).toBeHidden();
  await expect(page.locator('#btnMenu')).toBeFocused();
});

test('الوصولية: Esc يغلق وضع القراءة', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'للقراءة');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');
  await page.locator('.note-card').first().click();
  await expect(page.locator('#reader')).toBeVisible();
  await expect(page.locator('#rEdit')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reader')).toBeHidden();
});

test('ترويسة القسم تعرّف بالصفحة (الأرشيف والمهملات)', async ({ page }) => {
  await open(page);
  await expect(page.locator('#viewHeader')).toBeHidden();
  await page.click('#btnMenu');
  await page.click('#tabs [data-view="archive"]');
  await expect(page.locator('#vhTitle')).toHaveText('الأرشيف');
  await page.click('#btnMenu');
  await page.click('#tabs [data-view="trash"]');
  await expect(page.locator('#vhTitle')).toHaveText('المهملات');
  await expect(page.locator('#vhHint')).toContainText('30 يوماً');
});

test('إجراءات سريعة في وضع القراءة: أرشفة مع تراجع ثم حذف', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'إجراء سريع');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');

  await page.locator('.note-card').first().click();
  await page.click('#rArchive');
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('.note-card')).toHaveCount(0);
  await page.click('#toast button'); // تراجع
  await expect(page.locator('.note-card')).toHaveCount(1);

  await page.locator('.note-card').first().click();
  await page.click('#rTrash');
  await expect(page.locator('.note-card')).toHaveCount(0);
});

test('لا شاشة سبلاش داخلية: الواجهة جاهزة مباشرة', async ({ page }) => {
  await page.goto('./');
  expect(await page.locator('#splash').count()).toBe(0);
  await expect(page.locator('#fab')).toBeVisible();
});

test('ملاحظة معطوبة لا تُفرغ الشاشة: الباقي يظهر وتظهر بطاقة بديلة', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'سليمة');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const r = indexedDB.open('nawy-note-db');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('notes', 'readwrite');
          const now = Date.now();
          tx.objectStore('notes').put({
            id: 'bad',
            type: 'text',
            title: 'معطوبة',
            body: '',
            items: [],
            color: 'default',
            pinned: false,
            status: 'active',
            order: -now - 1,
            createdAt: now,
            updatedAt: now,
            trashedAt: null,
            attachments: [{ id: 'd', kind: 'draw', blob: null, drawing: { width: 100, height: 100, strokes: [null] } }],
          });
          tx.oncomplete = () => {
            r.result.close();
            res();
          };
        };
      }),
  );
  await page.reload();
  await page.waitForSelector('#fab');
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.locator('.note-card', { hasText: 'سليمة' })).toBeVisible();
  await expect(page.locator('.note-card', { hasText: 'تعذّر عرض محتواها' })).toBeVisible();
});

test.describe('سطح المكتب: شريط جانبي ثابت قابل للطي', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('ظاهر افتراضياً، يبقى عند التنقل، يُطوى ويُحفظ الاختيار', async ({ page }) => {
    await open(page);
    await expect(page.locator('#drawer')).toBeVisible();
    await page.click('#tabs [data-view="archive"]');
    await expect(page.locator('#vhTitle')).toHaveText('الأرشيف');
    await expect(page.locator('#drawer')).toBeVisible(); // لا يُغلق بعد النقر

    await page.click('#btnMenu');
    await expect(page.locator('#drawer')).toBeHidden();
    await page.reload();
    await page.waitForSelector('#fab');
    await expect(page.locator('#drawer')).toBeHidden(); // الاختيار محفوظ

    await page.click('#btnMenu');
    await expect(page.locator('#drawer')).toBeVisible();
  });
});

test.describe('سطح المكتب: السحب بالفأرة لإعادة الترتيب', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('سحب البطاقة الأولى إلى آخر الشبكة يغيّر الترتيب ويبقى بعد التحميل', async ({ page }) => {
    await open(page);
    for (const t of ['أ', 'ب', 'ج']) {
      await newNote(page, 'text');
      await page.fill('#eTitle', t);
      await expect(page.locator('#eSaved')).toContainText('محفوظة');
      await page.click('#eDone');
      await expect(page.locator('.note-card', { hasText: t })).toBeVisible();
    }
    const titles = () => page.locator('#grid .note-card h3').allInnerTexts();
    expect(await titles()).toEqual(['ج', 'ب', 'أ']); // الأحدث أولاً

    const cards = page.locator('#grid .note-card');
    const a = (await cards.nth(0).boundingBox())!;
    const c = (await cards.nth(2).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    // حركة بطيئة نسبياً كالمستخدم الحقيقي
    await page.mouse.move(a.x + a.width / 2 - 20, a.y + a.height / 2, { steps: 4 });
    await page.waitForTimeout(120);
    const tx = c.x + c.width * 0.6;
    const ty = c.y + c.height / 2;
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(a.x + ((tx - a.x) * i) / 8, a.y + ((ty - a.y) * i) / 8);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(200);
    await page.mouse.move(tx + 4, ty + 2);
    await page.waitForTimeout(120);
    await page.mouse.up();

    await expect.poll(titles).not.toEqual(['ج', 'ب', 'أ']);
    const after = await titles();
    await page.waitForTimeout(400); // اكتمال الحفظ في IndexedDB قبل إعادة التحميل
    await page.reload();
    await page.waitForSelector('#fab');
    expect(await titles()).toEqual(after);
  });
});

test.describe('سطح المكتب: اختصارات لوحة المفاتيح', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('c ملاحظة جديدة، Ctrl+Enter يحفظ ويغلق، / للبحث، ? للمساعدة', async ({ page }) => {
    await open(page);
    await page.keyboard.press('c');
    await expect(page.locator('#eTitle')).toBeVisible();
    await page.fill('#eTitle', 'من الكيبورد');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('.note-card', { hasText: 'من الكيبورد' })).toBeVisible();

    await page.keyboard.press('/');
    await expect(page.locator('#search')).toBeFocused();
    await page.keyboard.type('c'); // أثناء الكتابة لا يفتح محرراً جديداً
    await expect(page.locator('#editor')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('#search').blur();

    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('#shortcutsHelp')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcutsHelp')).toHaveCount(0);

    await page.keyboard.press('3');
    await expect(page.locator('#vhTitle')).toHaveText('المهملات');
  });
});

test('مسودة غير محفوظة تُعرض للاستعادة بعد إغلاق مفاجئ', async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    localStorage.setItem(
      'nawy-note:draft',
      JSON.stringify({ id: 'draft-1', type: 'text', title: 'مسودة', body: 'نص لم يُحفظ', items: [], savedAt: Date.now() }),
    ),
  );
  await page.reload();
  await page.waitForSelector('#fab');
  await page.click('#toast button');
  await expect(page.locator('#eText')).toHaveValue('نص لم يُحفظ');
  await expect(page.locator('#eTitle')).toHaveValue('مسودة');
});

test('فشل الحفظ (امتلاء التخزين) لا يضيّع النص ويُعاد تلقائياً', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.evaluate(() => {
    const w = window as unknown as { __fail: boolean };
    w.__fail = true;
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a: Parameters<typeof orig>) {
      if (w.__fail) throw new DOMException('quota', 'QuotaExceededError');
      return orig.apply(this, a);
    };
  });
  await page.fill('#eText', 'نص مهم جداً');
  await expect(page.locator('#eSaved')).toContainText('تعذّر الحفظ');
  expect(await page.evaluate(() => localStorage.getItem('nawy-note:draft'))).toContain('نص مهم جداً');

  await page.evaluate(() => ((window as unknown as { __fail: boolean }).__fail = false));
  await expect(page.locator('#eSaved')).toContainText('محفوظة', { timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem('nawy-note:draft'))).toBeNull();
  await page.click('#eDone');
  await expect(page.locator('.note-card')).toContainText('نص مهم جداً');
});

test('تعذّر فتح قاعدة البيانات يعرض شاشة استرداد بلا حذف بيانات', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException('denied', 'SecurityError');
    };
  });
  await page.goto('./');
  await expect(page.locator('#dbRecovery')).toBeVisible();
  await expect(page.locator('#dbRecovery')).toContainText('بياناتك لم تُحذف');
  await page.keyboard.press('Escape');
  await expect(page.locator('#dbRecovery')).toHaveCount(0);
});

test('تعديل من تبويب آخر لا يُطمس: يُحفظ كنسخة جديدة', async ({ page, context }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'أصلية');
  await page.fill('#eText', 'نص أول');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');

  await page.locator('.note-card').first().click();
  await page.click('#rEdit');
  await page.waitForSelector('#eText');

  const other = await context.newPage();
  await open(other);
  await other.locator('.note-card').first().click();
  await other.click('#rEdit');
  await other.fill('#eText', 'نص من التبويب الآخر');
  await expect(other.locator('#eSaved')).toContainText('محفوظة');
  await other.click('#eDone');

  await page.fill('#eText', 'تعديل التبويب الأول');
  await expect(page.locator('#toast')).toContainText('نافذة أخرى');
  await page.click('#eDone');

  await page.reload();
  await page.waitForSelector('#fab');
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.locator('#grid')).toContainText('نص من التبويب الآخر');
  await expect(page.locator('#grid')).toContainText('تعديل التبويب الأول');
});

test('سياسة أمان المحتوى مفعّلة ولا تُسجَّل مخالفات في الاستخدام العادي', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await open(page);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await newNote(page, 'list');
  await page.fill('#eTitle', 'قائمة');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');
  await page.locator('.note-card').first().click();
  await page.keyboard.press('Escape');
  // حقن سكربت مضمّن لا يجب أن يُنفَّذ
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = 1';
    document.body.appendChild(s);
    return (window as unknown as { __injected?: number }).__injected === 1;
  });
  expect(ran).toBe(false);
  const v = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(v.filter((x) => !x.startsWith('script-src-elem'))).toEqual([]);
});

test('بلا إنترنت: الإنشاء والحفظ يعملان (محلي أولاً)', async ({ page, context }) => {
  await open(page);
  await context.setOffline(true);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'بدون شبكة');
  await page.fill('#eText', 'يعمل');
  await expect(page.locator('#eSaved')).toContainText('محفوظة');
  await page.click('#eDone');
  await expect(page.locator('.note-card')).toContainText('بدون شبكة');
  await context.setOffline(false);
});

test('إغلاق المحرر فوراً بعد الكتابة لا يُضيّع النص', async ({ page }) => {
  await open(page);
  await newNote(page, 'text');
  await page.fill('#eTitle', 'سريعة');
  await page.fill('#eText', 'كتبت وأغلقت فوراً');
  await page.click('#eDone'); // قبل انتهاء مهلة الحفظ المؤجَّل
  await expect(page.locator('#editor')).toBeHidden(); // يُخفى بعد اكتمال الحفظ
  await page.reload();
  await page.waitForSelector('#fab');
  await expect(page.locator('.note-card')).toContainText('سريعة');
});
