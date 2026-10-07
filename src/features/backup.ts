import { db, exportBackup, importBackup } from '../db';
import { $ } from '../lib/util';
import { toast } from '../lib/toast';

const BK_LAST = 'nawy-note:last-backup';
const BK_ASKED = 'nawy-note:backup-asked';
const DAY = 86_400_000;

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function doBackup(): Promise<void> {
  const b = await exportBackup();
  download(b, `nawy-note-${new Date().toISOString().slice(0, 10)}.json`);
  try {
    localStorage.setItem(BK_LAST, String(Date.now()));
  } catch {
    /* تجاهل */
  }
}

/** البيانات محلية فقط؛ نذكّر مرة كل أسبوعين كحدّ أقصى إن مضى 30 يوماً بلا نسخة. */
async function maybeRemindBackup(): Promise<void> {
  try {
    const now = Date.now();
    if (!localStorage.getItem(BK_ASKED)) {
      localStorage.setItem(BK_ASKED, String(now));
      return;
    } // أول استخدام: ابدأ العدّ
    const last = Number(localStorage.getItem(BK_LAST) ?? localStorage.getItem(BK_ASKED));
    const asked = Number(localStorage.getItem(BK_ASKED));
    if (now - last < 30 * DAY || now - asked < 14 * DAY) return;
    if ((await db.notes.filter((n) => n.status !== 'deleted').count()) < 3) return;
    localStorage.setItem(BK_ASKED, String(now));
    toast('ملاحظاتك محفوظة على هذا الجهاز فقط. خذ نسخة احتياطية؟', { label: 'نسخ الآن', run: () => void doBackup() });
  } catch {
    /* تجاهل */
  }
}

/** يربط زر النسخ الاحتياطي (تصدير/استيراد) ويجدول التذكير. */
export function mountBackup(): void {
  const file = $<HTMLInputElement>('#importFile');
  $('#btnBackup').onclick = () => {
    if (confirm('موافق = تصدير نسخة احتياطية\nإلغاء = استيراد نسخة من ملف')) void doBackup();
    else file.click();
  };
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const n = await importBackup(await f.text());
      toast(`تم استيراد ${n} ملاحظة`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'فشل الاستيراد');
    }
  };
  setTimeout(() => void maybeRemindBackup(), 4000);
}
