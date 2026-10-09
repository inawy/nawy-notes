import type { Layout, SortDir, SortMode } from '../types';

/** تفضيلات العرض المحفوظة محلياً. منطق نقي: يتحمل أي JSON تالف ويتجاهل القيم غير المعروفة. */
export interface Prefs {
  sort: SortMode;
  dir: SortDir;
  layout: Layout;
}

export const DEFAULT_PREFS: Prefs = { sort: 'manual', dir: 'desc', layout: 'grid' };

export function parsePrefs(raw: string | null | undefined): Prefs {
  const out = { ...DEFAULT_PREFS };
  try {
    const p = JSON.parse(raw ?? '{}') as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') return out;
    if (p.sort === 'manual' || p.sort === 'created' || p.sort === 'updated') out.sort = p.sort;
    if (p.dir === 'asc' || p.dir === 'desc') out.dir = p.dir;
    if (p.layout === 'grid' || p.layout === 'list') out.layout = p.layout;
  } catch {
    /* تالف: الافتراضي */
  }
  return out;
}

export const serializePrefs = (p: Prefs): string => JSON.stringify({ sort: p.sort, dir: p.dir, layout: p.layout });
