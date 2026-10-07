import Dexie, { type Table } from 'dexie';
import type {
  Note,
  NoteStatus,
  NoteType,
  SerializedAttachment,
  SerializedNote,
  SortDir,
  SortMode,
  View,
} from './types';
import { buildEnvelope, normalizeNote, parseEnvelope } from './data/envelope';

export { normalizeNote, ImportError } from './data/envelope';
import { DAY, blobToDataUrl, dataUrlToBlob, normalize, uid } from './lib/util';

/**
 * اسم قاعدة جديد (وليس 'NawyNotes') لتفادي تعارض المفتاح الأساسي
 * مع النسخة القديمة أحادية الملف التي كانت تستخدم ++id رقمياً.
 *
 * للترقية لاحقاً: أضف version(n+1) مع upgrade ولا تعدّل النسخ السابقة.
 */
class NawyDB extends Dexie {
  declare notes: Table<Note, string>; // declare: لا يُنشئ حقلاً فيطمس الجدول الذي ينشئه Dexie

  constructor() {
    super('nawy-note-db');
    this.version(1).stores({
      // الفهارس فقط — باقي الحقول تُخزَّن دون فهرسة.
      notes: 'id, status, pinned, updatedAt, trashedAt',
    });
    // v2: صارت الملاحظة تحمل مرفقات (حقل غير مفهرس => نفس الفهارس).
    // لا نستخدم upgrade(): الترحيل يتم عند القراءة (normalizeNote) ويُحفظ مع أول تعديل،
    // فلا يوجد ما قد يفشل أثناء فتح قاعدة موجودة.
    this.version(2).stores({ notes: 'id, status, pinned, updatedAt, trashedAt' });
  }
}

export const db = new NawyDB();

export const TRASH_DAYS = 30;

export function newNote(type: NoteType): Note {
  const now = Date.now();
  return {
    id: uid(),
    type,
    title: '',
    body: '',
    items: [],
    attachments: [],
    order: -now, // الأحدث أولاً
    color: 'default',
    pinned: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  };
}

export function isEmptyNote(n: Note): boolean {
  if (n.title.trim() || n.attachments.length) return false;
  return n.type === 'text' ? !n.body.trim() : !n.items.some((i) => i.text.trim());
}

export async function getNote(id: string): Promise<Note | undefined> {
  const n = await db.notes.get(id);
  return n ? normalizeNote(n) : undefined;
}

export async function saveNote(n: Note): Promise<void> {
  n.updatedAt = Date.now();
  // نسخة "نظيفة" حتى لا نخزّن proxies أو مراجع DOM بالخطأ.
  await db.notes.put(structuredClone(n)); // structuredClone يحافظ على Blob
}

export async function setStatus(id: string, status: NoteStatus): Promise<void> {
  await db.notes.update(id, {
    status,
    pinned: false,
    updatedAt: Date.now(),
    trashedAt: status === 'trashed' ? Date.now() : null,
  });
}

/** يعيد الحالة السابقة بالكامل (للتراجع): الحالة + التثبيت. */
export async function restoreState(id: string, status: NoteStatus, pinned: boolean): Promise<void> {
  await db.notes.update(id, {
    status,
    pinned,
    updatedAt: Date.now(),
    trashedAt: status === 'trashed' ? Date.now() : null,
  });
}

/** مدة الاحتفاظ بشواهد الحذف قبل تنظيفها (تتسع لمزامنة أجهزة غائبة مدة طويلة). */
export const TOMBSTONE_DAYS = 180;

/** حقول شاهد الحذف: تمسح المحتوى والوسائط (تحرير المساحة) وتُبقي المعرّف وتاريخ الحذف. */
export function tombstone(now: number): Partial<Note> {
  return {
    status: 'deleted',
    title: '',
    body: '',
    items: [],
    attachments: [],
    pinned: false,
    trashedAt: null,
    updatedAt: now,
    deletedAt: now,
  };
}

export async function deleteForever(id: string): Promise<void> {
  await db.notes.update(id, tombstone(Date.now()));
}

export async function emptyTrash(): Promise<void> {
  const t = tombstone(Date.now());
  await db.notes
    .where('status')
    .equals('trashed')
    .modify((n) => {
      Object.assign(n, structuredClone(t));
    });
}

/** يحذف ملاحظات المهملات القديمة (إلى شواهد) وينظّف الشواهد المنتهية. */
export async function purgeOldTrash(): Promise<void> {
  const now = Date.now();
  const cutoff = now - TRASH_DAYS * DAY;
  await db.notes
    .where('status')
    .equals('trashed')
    .filter((n) => (n.trashedAt ?? 0) < cutoff)
    .modify((n) => {
      Object.assign(n, structuredClone(tombstone(now)));
    });
  await db.notes
    .where('status')
    .equals('deleted')
    .filter((n) => (n.deletedAt ?? n.updatedAt) < now - TOMBSTONE_DAYS * DAY)
    .delete();
}

const VIEW_STATUS: Record<View, NoteStatus> = {
  notes: 'active',
  archive: 'archived',
  trash: 'trashed',
};

export const orderKey = (n: Note): number => n.order ?? -n.createdAt;

/**
 * يعيد ترتيب مجموعة ملاحظات ظاهرة. نعيد توزيع "خانات الترتيب" الحالية لها فقط،
 * فيبقى موقعها النسبي بالنسبة للملاحظات المخفية (بحث/قسم آخر) كما هو.
 * لا يغيّر updatedAt لأن تغيير الترتيب ليس تعديلاً على المحتوى.
 */
export async function reorderNotes(ids: string[]): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const found: Note[] = [];
    for (const id of ids) {
      const n = await db.notes.get(id);
      if (n) found.push(n);
    }
    const slots = found.map(orderKey).sort((a, b) => a - b);
    for (let i = 0; i < found.length; i++) await db.notes.update(found[i].id, { order: slots[i] });
  });
}

function searchable(n: Note): string {
  return normalize([n.title, n.body, ...n.items.map((i) => i.text)].join(' '));
}

/** تُستدعى داخل liveQuery، فأي تغيير في الجدول يعيد التحديث تلقائياً (حتى من تبويب آخر). */
export async function listNotes(
  view: View,
  query: string,
  sort: SortMode = 'manual',
  dir: SortDir = 'desc',
): Promise<Note[]> {
  let notes = (await db.notes.where('status').equals(VIEW_STATUS[view]).toArray()).map(normalizeNote);

  const q = normalize(query.trim());
  if (q) notes = notes.filter((n) => searchable(n).includes(q));

  notes.sort((a, b) => {
    if (view === 'trash') return (b.trashedAt ?? 0) - (a.trashedAt ?? 0);
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'manual') return orderKey(a) - orderKey(b);
    const f = sort === 'created' ? 'createdAt' : 'updatedAt';
    return dir === 'desc' ? b[f] - a[f] : a[f] - b[f];
  });
  return notes;
}

// ---------- النسخ الاحتياطي ----------

export async function exportBackup(): Promise<Blob> {
  const all = (await db.notes.toArray()).map(normalizeNote);
  const notes = await Promise.all(
    all.map(async (n): Promise<SerializedNote> => ({
      ...n,
      attachments: await Promise.all(
        n.attachments.map(async (a): Promise<SerializedAttachment> => ({
          ...a,
          blob: a.blob ? await blobToDataUrl(a.blob) : null,
        })),
      ),
    })),
  );
  return new Blob([JSON.stringify(buildEnvelope(notes))], { type: 'application/json' });
}

/** دمج: يُبقي الأحدث عند تطابق المعرّف. يرمي ImportError برسالة مفهومة. يعيد عدد الملاحظات المضافة/المحدَّثة. */
export async function importBackup(text: string): Promise<number> {
  const { notes: rawNotes } = parseEnvelope(text);

  // تحويل data: URL إلى Blob قبل فتح المعاملة (fetch غير آمن داخل معاملات IndexedDB)
  const prepared: Note[] = [];
  for (const raw of rawNotes) {
    const r = { ...raw };
    if (typeof r.media === 'string') r.media = await dataUrlToBlob(r.media); // صيغة 1 القديمة
    if (Array.isArray(r.attachments)) {
      r.attachments = await Promise.all(
        (r.attachments as SerializedAttachment[]).map(async (a) => ({
          ...a,
          blob: typeof a.blob === 'string' ? await dataUrlToBlob(a.blob) : null,
        })),
      );
    }
    prepared.push(normalizeNote(r));
  }

  let changed = 0;
  await db.transaction('rw', db.notes, async () => {
    for (const n of prepared) {
      const existing = await db.notes.get(n.id);
      if (!existing || existing.updatedAt < n.updatedAt) {
        await db.notes.put(n);
        changed++;
      }
    }
  });
  return changed;
}
