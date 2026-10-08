import { describe, expect, it } from 'vitest';
import { matchShortcut, type KeyContext, type KeyInfo } from '../../src/features/shortcuts';

const key = (code: string, o: Partial<KeyInfo> = {}): KeyInfo => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});
const idle: KeyContext = { typing: false, editorOpen: false, dialogOpen: false };

describe('matchShortcut', () => {
  it('مفاتيح مفردة تعمل بالموضع (لوحة عربية أيضاً)', () => {
    expect(matchShortcut(key('KeyC'), idle)).toBe('new-text');
    expect(matchShortcut(key('KeyL'), idle)).toBe('new-list');
    expect(matchShortcut(key('KeyG'), idle)).toBe('layout');
    expect(matchShortcut(key('Slash'), idle)).toBe('search');
    expect(matchShortcut(key('Slash', { shiftKey: true }), idle)).toBe('help');
    expect(matchShortcut(key('Digit2'), idle)).toBe('view-archive');
  });
  it('Ctrl/⌘+K للبحث و Ctrl+N لملاحظة جديدة', () => {
    expect(matchShortcut(key('KeyK', { ctrlKey: true }), idle)).toBe('search');
    expect(matchShortcut(key('KeyK', { metaKey: true }), idle)).toBe('search');
    expect(matchShortcut(key('KeyN', { ctrlKey: true }), idle)).toBe('new-text');
  });
  it('لا تعمل أثناء الكتابة في حقل', () => {
    expect(matchShortcut(key('KeyC'), { ...idle, typing: true })).toBeNull();
    expect(matchShortcut(key('Slash'), { ...idle, typing: true })).toBeNull();
  });
  it('لا تعمل والمحرر أو نافذة مفتوحة، عدا Ctrl+Enter للإغلاق', () => {
    expect(matchShortcut(key('KeyC'), { ...idle, editorOpen: true })).toBeNull();
    expect(matchShortcut(key('KeyL'), { ...idle, dialogOpen: true })).toBeNull();
    expect(matchShortcut(key('Enter', { ctrlKey: true }), { typing: true, editorOpen: true, dialogOpen: false })).toBe(
      'close-editor',
    );
    expect(matchShortcut(key('Enter', { ctrlKey: true }), idle)).toBeNull();
  });
  it('لا تلتقط تركيبات المتصفح (Ctrl+C، Alt+...)', () => {
    expect(matchShortcut(key('KeyC', { ctrlKey: true }), idle)).toBeNull();
    expect(matchShortcut(key('KeyC', { altKey: true }), idle)).toBeNull();
    expect(matchShortcut(key('KeyC', { shiftKey: true }), idle)).toBeNull();
  });
});
