// منطق نقي (بلا Dexie ولا DOM): مغلف التصدير الموحّد لناوي + ترحيل الصيغ القديمة.
// قابل للاختبار مباشرة بـ node:test.
import type { Attachment, Note, NotesData, NawyEnvelope, SerializedNote } from '../types';

/** رقم صيغة بيانات ناوي نوت. يزيد مع كل تغيير في شكل الملاحظة المصدَّرة. */
export const SCHEMA_VERSION = 2;
export const PRODUCT = 'note';

export class ImportError extends Error {}

/**
 * يحوّل أي صيغة قديمة (type: draw/audio/image مع drawing/media) إلى الصيغة الحالية.
 * آمن للتكرار: الملاحظة الحديثة تمر دون تغيير. المعرّفات ثابتة فالقراءة المتكررة تعطي نتيجة واحدة.
 */
export function normalizeNote(raw: object): Note {
  const n = { ...raw } as Record<string, unknown> & Partial<Note> & { drawing?: unknown; media?: unknown };
  const atts: Attachment[] = Array.isArray(n.attachments) ? [...(n.attachments as Attachment[])] : [];
  const legacy = n.type as string | undefined; // قد يكون draw/audio/image في بيانات قديمة
  if (legacy === 'draw' && n.drawing) {
    atts.push({ id: `m-${String(n.id)}`, kind: 'draw', blob: null, drawing: n.drawing as Attachment['drawing'] });
  } else if ((legacy === 'audio' || legacy === 'image') && n.media instanceof Blob) {
    atts.push({ id: `m-${String(n.id)}`, kind: legacy, blob: n.media, drawing: null });
  }
  if (n.type !== 'text' && n.type !== 'list') n.type = 'text';
  delete n.drawing;
  delete n.media;
  n.attachments = atts;
  n.items = Array.isArray(n.items) ? n.items : [];
  n.body = typeof n.body === 'string' ? n.body : '';
  n.title = typeof n.title === 'string' ? n.title : '';
  return n as unknown as Note;
}

export function buildEnvelope(notes: SerializedNote[], now: Date = new Date()): NawyEnvelope<NotesData> {
  return {
    app: 'nawy',
    product: PRODUCT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: { notes },
  };
}

/**
 * يتحقق من الملف المستورد (غير موثوق) ويعيد الملاحظات الخام.
 * يقبل: مغلف ناوي الحالي، وصيغتي ناوي نوت القديمتين (app:"nawy-note" إصدار 1 و2).
 * يرفض: JSON تالف، ملف من تطبيق آخر، وإصداراً أحدث مما نعرف.
 */
export function parseEnvelope(text: string): { notes: Record<string, unknown>[]; schemaVersion: number } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new ImportError('الملف ليس JSON صالحاً');
  }
  if (!obj || typeof obj !== 'object') throw new ImportError('الملف ليس نسخة احتياطية من ناوي');
  const f = obj as Record<string, unknown>;

  let notes: unknown;
  let version: unknown;
  if (f.app === 'nawy') {
    version = f.schemaVersion;
    notes = (f.data as { notes?: unknown } | undefined)?.notes;
  } else if (f.app === 'nawy-note') {
    version = f.version ?? 1; // الصيغة القديمة
    notes = f.notes;
  } else {
    throw new ImportError('الملف ليس نسخة احتياطية من ناوي');
  }

  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) {
    throw new ImportError('رقم إصدار الملف غير صالح');
  }
  if (version > SCHEMA_VERSION) {
    throw new ImportError('هذه النسخة الاحتياطية أحدث من هذا التطبيق. حدّث التطبيق ثم أعد المحاولة.');
  }
  if (!Array.isArray(notes)) throw new ImportError('الملف لا يحتوي على ملاحظات');

  const valid = (notes as unknown[]).filter(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { updatedAt?: unknown }).updatedAt === 'number',
  );
  return { notes: valid, schemaVersion: version };
}
