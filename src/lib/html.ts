import { esc } from './util';

/** نص HTML موثوق (بُني عبر `html` أو `raw`) فلا يُهرَّب مرة ثانية. */
export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

/** يعلّم نصاً على أنه HTML موثوق (أيقونات SVG ونحوها). لا تمرّر إليه نصاً من المستخدم أبداً. */
export const raw = (s: string): SafeHtml => new SafeHtml(s);

type Part = SafeHtml | string | number | null | undefined | false | Part[];

function render(v: Part): string {
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(String(v));
}

/**
 * قالب وسم يهرّب كل القيم تلقائياً؛ القيم الموثوقة فقط (`html`/`raw`) تمرّ كما هي.
 * القوائم تُدمج، و`false/null/undefined` تصبح فارغة (مناسب لـ `cond && html`…``).
 */
export function html(strings: TemplateStringsArray, ...values: Part[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((v, i) => {
    out += render(v) + (strings[i + 1] ?? '');
  });
  return new SafeHtml(out);
}
