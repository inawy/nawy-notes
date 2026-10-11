import Dexie, { type Table } from 'dexie';
import { db, exportBackup, importBackup } from './db';
import {
  chooseMode,
  pickPrune,
  snapshotBudget,
  shouldAutoSnapshot,
  type SnapshotReason,
} from './lib/snapshot-policy';
import { uid } from './lib/util';

/**
 * لقطات احتياطية تلقائية محلية. قاعدة بيانات منفصلة (`nawy-note-snapshots`) عمداً:
 * إن تلفت قاعدة الملاحظات أو فشل فتحها تبقى اللقطات سليمة. لا تلمس `nawy-note-db`.
 */
export interface Snapshot {
  id: string;
  createdAt: number;
  reason: SnapshotReason;
  /** عدد الملاحظات الحيّة وقت اللقطة. */
  notes: number;
  /** أحدث updatedAt كانت تغطيه. */
  dataUpdatedAt: number;
  /** خفيفة: بلا صور وصوت. */
  lite: boolean;
  size: number;
  /** ملف JSON بنفس صيغة النسخة الاحتياطية العادية. */
  blob: Blob;
}

class SnapshotDB extends Dexie {
  declare snaps: Table<Snapshot, string>;
  constructor() {
    super('nawy-note-snapshots');
    this.version(1).stores({ snaps: 'id, createdAt' });
  }
}
const sdb = new SnapshotDB();

export type SnapshotInfo = Omit<Snapshot, 'blob'>;

const toInfo = (s: Snapshot): SnapshotInfo => ({
  id: s.id,
  createdAt: s.createdAt,
  reason: s.reason,
  notes: s.notes,
  dataUpdatedAt: s.dataUpdatedAt,
  lite: s.lite,
  size: s.size,
});

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return (await sdb.snaps.orderBy('createdAt').reverse().toArray()).map(toInfo);
}

async function liveStats(): Promise<{ count: number; dataUpdatedAt: number; blobBytes: number }> {
  let count = 0;
  let blobBytes = 0;
  await db.notes.each((n) => {
    if (n.status === 'deleted') return;
    count++;
    for (const a of n.attachments ?? []) blobBytes += a.blob?.size ?? 0;
  });
  const last = await db.notes.orderBy('updatedAt').last();
  return { count, dataUpdatedAt: last?.updatedAt ?? 0, blobBytes };
}

async function storageEstimate(): Promise<{ usage?: number; quota?: number }> {
  try {
    const e = await navigator.storage?.estimate?.();
    return { usage: e?.usage, quota: e?.quota };
  } catch {
    return {};
  }
}

/** يأخذ لقطة الآن ويقلّم الأقدم. يرمي عند الفشل (الاستدعاء الأعلى يقرّر). */
export async function takeSnapshot(reason: SnapshotReason): Promise<SnapshotInfo | null> {
  const stats = await liveStats();
  if (stats.count === 0) return null;
  const { usage, quota } = await storageEstimate();
  const lite = chooseMode(stats.blobBytes, usage, quota) === 'lite';
  const blob = await exportBackup({ lite });
  const snap: Snapshot = {
    id: uid(),
    createdAt: Date.now(),
    reason,
    notes: stats.count,
    dataUpdatedAt: stats.dataUpdatedAt,
    lite,
    size: blob.size,
    blob,
  };
  await sdb.snaps.put(snap);
  const prune = pickPrune(await listSnapshots(), undefined, snapshotBudget(quota));
  if (prune.length) await sdb.snaps.bulkDelete(prune);
  return toInfo(snap);
}

/** لقطة تلقائية إن لزم (24 ساعة + تغيّر بيانات). لا ترمي أبداً: الحماية لا تعطّل التطبيق. */
export async function maybeAutoSnapshot(): Promise<SnapshotInfo | null> {
  try {
    const stats = await liveStats();
    const last = (await listSnapshots())[0];
    const ok = shouldAutoSnapshot({
      now: Date.now(),
      lastCreatedAt: last?.createdAt,
      lastDataUpdatedAt: last?.dataUpdatedAt,
      dataUpdatedAt: stats.dataUpdatedAt,
      liveCount: stats.count,
    });
    return ok ? await takeSnapshot('auto') : null;
  } catch (err) {
    console.warn('تعذّرت اللقطة التلقائية', err);
    return null;
  }
}

/** لقطة أمان قبل عملية خطرة. best-effort: فشلها لا يمنع العملية. */
export async function safetySnapshot(reason: Exclude<SnapshotReason, 'auto'>): Promise<void> {
  try {
    await takeSnapshot(reason);
  } catch (err) {
    console.warn('تعذّرت لقطة الأمان', err);
  }
}

export async function getSnapshotBlob(id: string): Promise<Blob | undefined> {
  return (await sdb.snaps.get(id))?.blob;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await sdb.snaps.delete(id);
}

/** 'deleted': يُرجع المحذوفة/المفقودة فقط. 'all': يعيد كل ما في اللقطة (للكاملة فقط). لقطة أمان تسبق دائماً. */
export async function restoreSnapshot(id: string, mode: 'deleted' | 'all'): Promise<number> {
  const snap = await sdb.snaps.get(id);
  if (!snap) throw new Error('اللقطة غير موجودة');
  if (snap.lite && mode === 'all') throw new Error('اللقطة الخفيفة لا تدعم العودة الكاملة (تخلو من الصور والصوت)');
  await safetySnapshot('before-import');
  return importBackup(await snap.blob.text(), { restore: mode });
}
