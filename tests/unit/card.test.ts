import { describe, expect, it } from 'vitest';
import { cardHTML, type CardContext } from '../../src/views/card';
import type { Note } from '../../src/types';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  type: 'text',
  title: '',
  body: '',
  items: [],
  attachments: [],
  color: 'default',
  pinned: false,
  status: 'active',
  createdAt: 1,
  updatedAt: 2,
  trashedAt: null,
  ...over,
});
const ctx = (over: Partial<CardContext> = {}): CardContext => ({
  trash: false,
  layout: 'grid',
  blobUrl: () => 'blob:mock',
  ...over,
});

describe('بطاقة الشبكة', () => {
  it('مربّعة وتحمل معرّف الملاحظة ولونها', () => {
    const html = cardHTML(note({ color: 'blue', title: 'عنوان' }), ctx());
    expect(html).toContain('data-id="n1"');
    expect(html).toContain('aspect-square');
    expect(html).toContain('nc-blue');
  });

  it('تهرّب العنوان والنص (لا HTML حرّ)', () => {
    const html = cardHTML(note({ title: '<img src=x onerror=alert(1)>', body: '<script>x</script>' }), ctx());
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('قائمة طويلة: 4 عناصر فقط ثم عدّاد الباقي', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: String(i), text: `عنصر ${i}`, done: false }));
    const html = cardHTML(note({ type: 'list', items }), ctx());
    expect(html).toContain('عنصر 3');
    expect(html).not.toContain('عنصر 4');
    expect(html).toContain('+ 3 عناصر أخرى');
  });

  it('الصورة تصبح غلافاً عبر blobUrl', () => {
    const blob = new Blob(['x']);
    const html = cardHTML(note({ attachments: [{ id: 'a', kind: 'image', blob, drawing: null }] }), ctx({ blobUrl: () => 'blob:cover' }));
    expect(html).toContain('src="blob:cover"');
    expect(html).toContain('object-cover');
  });

  it('الملاحظة المثبتة تُظهر الدبوس', () => {
    expect(cardHTML(note({ pinned: true, title: 'x' }), ctx())).toContain('📌');
  });
});

describe('بطاقة الصف (القائمة)', () => {
  it('ارتفاع ثابت 84px ووصف مختصر', () => {
    const html = cardHTML(note({ title: 'عنوان', body: 'نص الملاحظة' }), ctx({ layout: 'list' }));
    expect(html).toContain('h-[84px]');
    expect(html).toContain('نص الملاحظة');
  });

  it('قائمة مهام: الوصف عدد العناصر والمنجز', () => {
    const items = [
      { id: '1', text: 'أ', done: true },
      { id: '2', text: 'ب', done: false },
    ];
    expect(cardHTML(note({ type: 'list', title: 'مهام', items }), ctx({ layout: 'list' }))).toContain('2 عناصر، تمّ منها 1');
  });
});

describe('المهملات', () => {
  it('تُضاف أزرار الاستعادة والحذف النهائي فقط في المهملات', () => {
    const trashed = cardHTML(note({ title: 'x' }), ctx({ trash: true }));
    expect(trashed).toContain('data-act="restore"');
    expect(trashed).toContain('data-act="purge"');
    expect(cardHTML(note({ title: 'x' }), ctx())).not.toContain('data-act=');
  });
});
