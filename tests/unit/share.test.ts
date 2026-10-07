import { describe, expect, it } from 'vitest';
import { shareText } from '../../src/lib/share';
import type { Note } from '../../src/types';

const base = {
  id: 'a',
  type: 'text',
  title: ' عنوان ',
  body: ' نص ',
  items: [],
  attachments: [],
  color: 'default',
  pinned: false,
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  trashedAt: null,
} as Note;

describe('shareText', () => {
  it('نص عادي: عنوان ومحتوى مقصوصان', () => {
    expect(shareText(base)).toEqual({ title: 'عنوان', text: 'نص' });
  });
  it('قائمة: علامات ☐/☑ وتتجاهل الفارغ', () => {
    const n = {
      ...base,
      type: 'list',
      items: [
        { id: '1', text: 'خبز', done: true },
        { id: '2', text: ' ', done: false },
        { id: '3', text: 'حليب', done: false },
      ],
    } as Note;
    expect(shareText(n).text).toBe('☑ خبز\n☐ حليب');
  });
});
