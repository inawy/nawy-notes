/** مسودة طوارئ للنص فقط (بلا وسائط) في localStorage؛ شبكة أمان إن فشل الحفظ في IndexedDB. */
export const DRAFT_KEY = 'nawy-note:draft';
export const DRAFT_MAX_CHARS = 200_000;

export interface Draft {
  id: string;
  type: 'text' | 'list';
  title: string;
  body: string;
  items: { id: string; text: string; done: boolean }[];
  savedAt: number;
}

interface NoteLike {
  id: string;
  type: 'text' | 'list';
  title: string;
  body: string;
  items: { id: string; text: string; done: boolean }[];
}

export function makeDraft(n: NoteLike, now: number): Draft | null {
  const d: Draft = {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.type === 'text' ? n.body : '',
    items: n.type === 'list' ? n.items.map((i) => ({ id: i.id, text: i.text, done: i.done })) : [],
    savedAt: now,
  };
  const size = d.title.length + d.body.length + d.items.reduce((s, i) => s + i.text.length, 0);
  if (size === 0 || size > DRAFT_MAX_CHARS) return null;
  return d;
}

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Draft>;
    if (!d || typeof d.id !== 'string' || (d.type !== 'text' && d.type !== 'list')) return null;
    if (typeof d.savedAt !== 'number') return null;
    return {
      id: d.id,
      type: d.type,
      title: typeof d.title === 'string' ? d.title : '',
      body: typeof d.body === 'string' ? d.body : '',
      items: Array.isArray(d.items)
        ? d.items
            .filter((i) => i && typeof i.text === 'string')
            .map((i) => ({ id: String(i.id ?? crypto.randomUUID()), text: i.text, done: !!i.done }))
        : [],
      savedAt: d.savedAt,
    };
  } catch {
    return null;
  }
}

/** هل المسودة أحدث من النسخة المحفوظة (أو غير موجودة)؟ فقط حينها نعرض الاستعادة. */
export function needsRecovery(d: Draft, savedUpdatedAt: number | undefined): boolean {
  return savedUpdatedAt === undefined || d.savedAt > savedUpdatedAt;
}

/** يدمج المسودة في ملاحظة (موجودة أو جديدة) ويُرجع نسخة جديدة. */
export function applyDraft<T extends NoteLike>(base: T, d: Draft): T {
  return { ...base, type: d.type, title: d.title, body: d.body, items: d.items };
}

export function writeDraft(d: Draft | null): void {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* التخزين ممتلئ أو محجوب: المسودة اختيارية */
  }
}

export function clearDraft(id?: string): void {
  try {
    if (id) {
      const cur = parseDraft(localStorage.getItem(DRAFT_KEY));
      if (cur && cur.id !== id) return; // لا تمسح مسودة ملاحظة أخرى
    }
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* تجاهل */
  }
}

export function readDraft(): Draft | null {
  try {
    return parseDraft(localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}
