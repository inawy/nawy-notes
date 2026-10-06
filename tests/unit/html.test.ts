import { describe, expect, it } from 'vitest';
import { html, raw } from '../../src/lib/html';

describe('html (قالب يهرّب تلقائياً)', () => {
  it('يهرّب القيم النصية', () => {
    expect(String(html`<p>${'<script>x</script>'}</p>`)).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });
  it('يهرّب قيم الخصائص', () => {
    expect(String(html`<input value="${'"><img onerror=x>'}">`)).toBe(
      '<input value="&quot;&gt;&lt;img onerror=x&gt;">',
    );
  });
  it('يمرّر المحتوى الموثوق كما هو (متداخل وraw)', () => {
    expect(String(html`<ul>${html`<li>${'a&b'}</li>`}${raw('<hr>')}</ul>`)).toBe('<ul><li>a&amp;b</li><hr></ul>');
  });
  it('يدمج القوائم ويتجاهل false/null/undefined', () => {
    const items = ['x', 'y'].map((t) => html`<i>${t}</i>`);
    expect(String(html`${items}${false}${null}${undefined}${0}`)).toBe('<i>x</i><i>y</i>0');
  });
});
