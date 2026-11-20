import { addDays, parseISODate } from './time';
import type { EverydayRecord, ISODate, Note, NoteBlock, NoteKind } from './types';

export const noteKind = (note: Note): NoteKind => note.kind ?? 'note';

export const checklist = (note: Note) => note.blocks.filter(b => b.type === 'todo');

export function doneOn(note: Note, date: ISODate) {
  return new Set(note.days?.[date]?.items.filter(i => i.done).map(i => i.id) ?? []);
}

/** Snapshots the live checklist as `date`'s record, so past days keep the items as they were then. */
function recordDay(note: Note, date: ISODate, done: Set<string>): Note {
  const items = checklist(note).map(b => ({ id: b.id, text: b.text, done: done.has(b.id) }));
  return { ...note, days: { ...note.days, [date]: { items } } };
}

export function setTick(note: Note, date: ISODate, id: string, done: boolean): Note {
  const ticked = doneOn(note, date);
  if (done) ticked.add(id); else ticked.delete(id);
  return recordDay(note, date, ticked);
}

/** Keeps today's record in step with checklist edits (renamed, added or removed items). */
export function syncToday(note: Note, today: ISODate): Note {
  if (noteKind(note) !== 'everyday' || !note.days?.[today]) return note;
  return recordDay(note, today, doneOn(note, today));
}

export function deleteDay(note: Note, date: ISODate): Note {
  const days = { ...note.days };
  delete days[date];
  return { ...note, days };
}

export function dayProgress(record: EverydayRecord | undefined) {
  const items = record?.items ?? [];
  return { done: items.filter(i => i.done).length, total: items.length };
}

/** Consecutive fully-completed days, ending today (or yesterday while today is still in progress). */
export function streak(note: Note, today: ISODate) {
  const complete = (d: ISODate) => { const p = dayProgress(note.days?.[d]); return p.total > 0 && p.done === p.total; };
  let day = complete(today) ? today : addDays(today, -1);
  let count = 0;
  while (complete(day)) { count++; day = addDays(day, -1); }
  return count;
}

const CELL_LIMIT = 32_000;

export function blocksToText(blocks: NoteBlock[]) {
  let n = 0;
  return blocks.map(b => {
    n = b.type === 'numbered' ? n + 1 : 0;
    switch (b.type) {
      case 'divider': return '———';
      case 'bullet': return `• ${b.text}`;
      case 'numbered': return `${n}. ${b.text}`;
      case 'todo': return `[${b.checked ? 'x' : ' '}] ${b.text}`;
      case 'quote': return `“${b.text}”`;
      default: return b.text;
    }
  }).filter(Boolean).join('\n').slice(0, CELL_LIMIT);
}

const longDate = (d: ISODate) => parseISODate(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const journalTitle = longDate;

/** One sheet per note type; rows are flat so the file opens cleanly in Excel or Google Sheets. */
export function notesWorkbookRows(notes: Note[]) {
  const updated = (n: Note) => new Date(n.updatedAt).toLocaleString('en-GB');
  const journal = notes.filter(n => noteKind(n) === 'journal')
    .sort((a, b) => (b.journalDate ?? '').localeCompare(a.journalDate ?? ''))
    .map(n => ({ Date: n.journalDate ?? '', Day: n.journalDate ? longDate(n.journalDate) : '', Title: n.title, Entry: blocksToText(n.blocks), 'Last edited': updated(n) }));
  const everyday = notes.filter(n => noteKind(n) === 'everyday');
  const dailySummary = everyday.flatMap(n => Object.entries(n.days ?? {}).map(([date, rec]) => {
    const p = dayProgress(rec);
    return { Date: date, Note: n.title || 'Untitled', Done: p.done, Total: p.total, 'Completed %': p.total ? Math.round((p.done / p.total) * 100) : 0 };
  })).sort((a, b) => b.Date.localeCompare(a.Date) || a.Note.localeCompare(b.Note));
  const dailyItems = everyday.flatMap(n => Object.entries(n.days ?? {}).flatMap(([date, rec]) =>
    rec.items.map(i => ({ Date: date, Note: n.title || 'Untitled', Item: i.text, Done: i.done ? 'Yes' : 'No' })),
  )).sort((a, b) => b.Date.localeCompare(a.Date));
  const plain = notes.filter(n => noteKind(n) === 'note')
    .map(n => ({ Title: n.title || 'Untitled', Category: n.category, Content: blocksToText(n.blocks), Created: new Date(n.createdAt).toLocaleString('en-GB'), 'Last edited': updated(n) }));
  return { Journal: journal, 'Every day': dailySummary, 'Every day items': dailyItems, Notes: plain };
}

export async function downloadNotesWorkbook(notes: Note[], fileName: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(notesWorkbookRows(notes))) {
    const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['Nothing here yet']]);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  XLSX.writeFile(wb, fileName);
}
