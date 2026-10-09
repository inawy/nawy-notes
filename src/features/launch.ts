import { newNote } from '../db';
import { openEditor } from '../editor';

/** نقاط الدخول: اختصارات الأيقونة (`?new=…`) والمشاركة من تطبيقات أخرى (`?title&text&url`). */
export function handleLaunchIntent(): void {
  const q = new URLSearchParams(location.search);
  const kind = q.get('new');
  const shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean) as string[];
  if (!kind && !shared.length) return;
  history.replaceState(null, '', location.pathname + location.hash); // لا يتكرر عند التحديث
  if (shared.length) {
    const note = newNote('text');
    note.title = shared.length > 1 ? (shared[0] ?? '') : '';
    note.body = shared.slice(shared.length > 1 ? 1 : 0).join('\n');
    openEditor(note, true);
  } else if (kind === 'text' || kind === 'list') openEditor(newNote(kind), true);
  else if (kind === 'audio' || kind === 'draw') openEditor(newNote('text'), true, kind);
}
