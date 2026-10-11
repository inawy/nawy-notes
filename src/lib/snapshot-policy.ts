/** سياسة اللقطات التلقائية: منطق نقي بلا DOM ولا قاعدة بيانات (يُختبر بـ vitest). */
export const SNAPSHOT_KEEP = 5;
export const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** فوق هذا الحجم من المرفقات نأخذ لقطة «خفيفة» بلا صور/صوت لحماية المساحة والذاكرة. */
export const FULL_MAX_BLOB_BYTES = 30 * 1024 * 1024;

export type SnapshotReason = 'auto' | 'before-import' | 'before-empty-trash' | 'manual';

export interface AutoCheck {
  now: number;
  /** وقت إنشاء آخر لقطة، أو undefined إن لم توجد. */
  lastCreatedAt?: number;
  /** أحدث updatedAt كانت تغطيه آخر لقطة. */
  lastDataUpdatedAt?: number;
  /** أحدث updatedAt لأي ملاحظة الآن. */
  dataUpdatedAt: number;
  /** عدد الملاحظات الحيّة (ليست شواهد حذف). */
  liveCount: number;
}

/** لقطة تلقائية: توجد بيانات، تغيّر شيء منذ آخر لقطة، ومضت 24 ساعة (أو لا توجد لقطة). */
export function shouldAutoSnapshot(c: AutoCheck): boolean {
  if (c.liveCount <= 0) return false;
  if (c.lastCreatedAt === undefined) return true;
  if (c.dataUpdatedAt <= (c.lastDataUpdatedAt ?? 0)) return false;
  return c.now - c.lastCreatedAt >= AUTO_INTERVAL_MS;
}

/** معرّفات اللقطات الأقدم من آخر `keep` لقطة (لحذفها). */
export function pickPrune(list: { id: string; createdAt: number }[], keep = SNAPSHOT_KEEP): string[] {
  return [...list]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(keep)
    .map((x) => x.id);
}

/** كاملة (بمرفقاتها) أم خفيفة؟ الخفيفة إن كبرت المرفقات أو اقتربنا من سعة التخزين. */
export function chooseMode(blobBytes: number, usage?: number, quota?: number): 'full' | 'lite' {
  if (blobBytes > FULL_MAX_BLOB_BYTES) return 'lite';
  // الترميز base64 يضخّم الحجم ~1.4×
  if (usage !== undefined && quota && usage + blobBytes * 1.4 > quota * 0.8) return 'lite';
  return 'full';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} ب`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ك.ب`;
  return `${(n / 1048576).toFixed(n >= 10 * 1048576 ? 0 : 1)} م.ب`;
}

export const REASON_LABEL: Record<SnapshotReason, string> = {
  auto: 'تلقائية',
  'before-import': 'قبل استيراد',
  'before-empty-trash': 'قبل إفراغ المهملات',
  manual: 'يدوية',
};
