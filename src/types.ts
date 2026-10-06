/** نوع محتوى الملاحظة الأساسي. الصور والصوت والرسم مرفقات وليست أنواعاً. */
export type NoteType = 'text' | 'list';
export type AttachmentKind = 'image' | 'audio' | 'draw';
export type NoteStatus = 'active' | 'archived' | 'trashed';

export const COLOR_IDS = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const COLOR_LABELS: Record<ColorId, string> = {
  default: 'افتراضي',
  red: 'أحمر',
  orange: 'برتقالي',
  yellow: 'أصفر',
  green: 'أخضر',
  teal: 'تركواز',
  blue: 'أزرق',
  purple: 'بنفسجي',
  pink: 'وردي',
  gray: 'رمادي',
};

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

/** نقطة رسم: [x, y, pressure] بإحداثيات منطقية ثابتة (لا تتأثر بحجم الشاشة). */
export type Pt = [number, number, number];

export interface Stroke {
  points: Pt[];
  /** 'ink' = لون النص الحالي (يتكيف مع الوضع الداكن) أو لون hex. */
  color: string;
  size: number;
  /** true إذا كان الضغط حقيقياً (قلم)، وإلا يُحاكى الضغط. */
  pen: boolean;
}

export interface Drawing {
  width: number;
  height: number;
  strokes: Stroke[];
}

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  /** للصور والصوت. */
  blob: Blob | null;
  /** للرسم. */
  drawing: Drawing | null;
}

export interface Note {
  /** UUID نصي — جاهز للمزامنة المستقبلية دون تعارض المعرفات. */
  id: string;
  type: NoteType;
  title: string;
  body: string;
  items: CheckItem[];
  /** صور وتسجيلات ورسوم (Blob مخزّن مباشرة في IndexedDB). */
  attachments: Attachment[];
  color: ColorId;
  /** ترتيب يدوي تصاعدي (الأصغر أولاً). الملاحظات القديمة بدونه تُرتَّب بـ -createdAt. */
  order?: number;
  pinned: boolean;
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
}

export type View = 'notes' | 'archive' | 'trash';
export type SortMode = 'manual' | 'created' | 'updated';
export type SortDir = 'desc' | 'asc';
export type Layout = 'grid' | 'list';

export type SerializedAttachment = Omit<Attachment, 'blob'> & { blob: string | null };
/** الملاحظة كما تُكتب في ملف التصدير: الوسائط نص data: URL. */
export type SerializedNote = Omit<Note, 'attachments'> & { attachments: SerializedAttachment[] };

/** محتوى منتج الملاحظات داخل مغلف ناوي. */
export interface NotesData {
  notes: SerializedNote[];
}

/** مغلف التصدير الموحّد لمنتجات ناوي (انظر .skills/nawy-data). */
export interface NawyEnvelope<T> {
  app: 'nawy';
  /** المنتج الذي صدّر الملف، ليتمكن ناوي الأم من دمج بيانات عدة منتجات. */
  product: string;
  schemaVersion: number;
  exportedAt: string;
  data: T;
}
