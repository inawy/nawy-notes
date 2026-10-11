// منطق نقي (بلا Dexie ولا DOM): ماذا سيفعل الاستيراد؟ يطابق قاعدة الدمج في db.importBackup:
// تُطبَّق الملاحظة الواردة فقط إن لم توجد، أو كانت أحدث من الموجودة.

export interface IncomingNote {
  id: string;
  updatedAt: number;
  status?: string;
  title?: string;
}
export interface ExistingNote {
  updatedAt: number;
  status: string;
}
export type PlanKind = 'add' | 'update' | 'remove';
export interface ImportPlan {
  /** كل ما في الملف. */
  total: number;
  /** ملاحظات جديدة ستُضاف. */
  add: number;
  /** ملاحظات موجودة ستُستبدل بنسخة أحدث من الملف. */
  update: number;
  /** ملاحظات حيّة عندك سيحذفها الملف (شاهد حذف أحدث). */
  remove: number;
  /** مطابقة تماماً (نفس وقت التعديل). */
  same: number;
  /** موجودة عندك بنسخة أحدث فتُتجاهل نسخة الملف. */
  older: number;
  /** شواهد حذف بلا ملاحظة حيّة تقابلها: لا أثر مرئي. */
  ignored: number;
  /** عيّنة للعرض (حتى 5 لكل نوع). */
  samples: { kind: PlanKind; title: string }[];
}

const SAMPLE_MAX = 5;

export function planImport(incoming: IncomingNote[], existing: Map<string, ExistingNote>): ImportPlan {
  const p: ImportPlan = { total: incoming.length, add: 0, update: 0, remove: 0, same: 0, older: 0, ignored: 0, samples: [] };
  const seen: Record<PlanKind, number> = { add: 0, update: 0, remove: 0 };
  const sample = (kind: PlanKind, title: string | undefined, fallback: string) => {
    if (seen[kind]++ < SAMPLE_MAX) p.samples.push({ kind, title: (title ?? '').trim() || fallback });
  };

  for (const n of incoming) {
    const cur = existing.get(n.id);
    const deleted = n.status === 'deleted';
    if (cur && cur.updatedAt === n.updatedAt) {
      p.same++;
    } else if (cur && cur.updatedAt > n.updatedAt) {
      p.older++;
    } else if (deleted) {
      // الملف يحمل شاهد حذف أحدث (أو غير موجود عندنا)
      if (cur && cur.status !== 'deleted') {
        p.remove++;
        sample('remove', n.title, '(بلا عنوان)');
      } else p.ignored++;
    } else if (!cur || cur.status === 'deleted') {
      p.add++;
      sample('add', n.title, '(بلا عنوان)');
    } else {
      p.update++;
      sample('update', n.title, '(بلا عنوان)');
    }
  }
  return p;
}

/** هل يغيّر الاستيراد شيئاً مرئياً؟ */
export const planHasChanges = (p: ImportPlan): boolean => p.add + p.update + p.remove > 0;
