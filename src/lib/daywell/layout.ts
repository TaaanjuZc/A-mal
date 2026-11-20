import type { DashboardBlock, DashboardBlockId } from './types';

export const BLOCK_TITLES: Record<DashboardBlockId, string> = {
  greeting: 'Personalized greeting',
  stats: 'At a glance',
  today: 'Today’s tasks',
  upcoming: 'Upcoming activities',
  namaz: 'Namaz times',
  classes: 'Class routine',
  activeClass: 'Class countdown',
  notes: 'Notes',
  reminders: 'Reminders',
  inspiration: 'Room to grow',
};

export const DEFAULT_LAYOUT: DashboardBlock[] = (
  [
    ['greeting', 'full'],
    ['stats', 'full'],
    ['today', 'lg'],
    ['namaz', 'sm'],
    ['activeClass', 'md'],
    ['upcoming', 'md'],
    ['classes', 'md'],
    ['reminders', 'md'],
    ['notes', 'md'],
    ['inspiration', 'md'],
  ] as const
).map(([id, size], order) => ({ id, size, order, visible: true }));

/** Keeps saved layouts valid when blocks are added or removed in later versions. */
export function normalizeLayout(saved: DashboardBlock[] | null | undefined): DashboardBlock[] {
  const known = new Set(DEFAULT_LAYOUT.map(b => b.id));
  const kept = (saved ?? []).filter(b => known.has(b.id));
  const missing = DEFAULT_LAYOUT.filter(d => !kept.some(b => b.id === d.id));
  return [...kept, ...missing].map((b, order) => ({ ...b, order }));
}
