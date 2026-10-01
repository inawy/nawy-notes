/** اختيار ملف من الجهاز/الكاميرا. يعيد null عند الإلغاء. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

/** تصغير الصورة إلى حد أقصى للضلع الأطول وضغطها JPEG لتوفير المساحة. */
export async function resizeImage(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('تعذّر معالجة الصورة');
  ctx.fillStyle = '#fff'; // PNG شفاف -> خلفية بيضاء بدل الأسود في JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('تعذّر معالجة الصورة'))), 'image/jpeg', quality),
  );
}

export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];

  get active(): boolean {
    return this.rec?.state === 'recording';
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('المتصفح لا يدعم التسجيل الصوتي');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.rec;
      if (!rec) return reject(new Error('لا يوجد تسجيل'));
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        this.release();
        resolve(new Blob(this.chunks, { type }));
      };
      rec.stop();
    });
  }

  /** إلغاء وتجاهل ما سُجّل. */
  cancel(): void {
    if (this.rec) this.rec.onstop = null;
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    } catch { /* انتهى أصلاً */ }
    this.release();
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}
