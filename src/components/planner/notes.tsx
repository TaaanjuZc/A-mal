import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Bold, BookOpen, Check, CloudOff, FileSpreadsheet, GripVertical, Italic, Loader2, Plus, Repeat, Search, Strikethrough, Trash2, Underline } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { checklist, dayProgress, deleteDay, doneOn, downloadNotesWorkbook, journalTitle, noteKind, setTick, streak, syncToday } from '@/lib/daywell/notes';
import { addDays, parseISODate, toISODate, uid } from '@/lib/daywell/time';
import type { BlockMarks, BlockType, ISODate, Note, NoteBlock, NoteColor, NoteKind } from '@/lib/daywell/types';
import { PageHeading } from './shell';
import { usePlanner, useNow } from './state';

export const NOTE_COLORS: Record<NoteColor, { label: string; className: string }> = {
  plain: { label: 'Default', className: 'bg-card text-foreground border border-border' },
  yellow: { label: 'Sunny', className: 'bg-yellow text-ink' },
  lime: { label: 'Lime', className: 'bg-lime text-ink' },
  lilac: { label: 'Lilac', className: 'bg-lilac text-ink' },
  coral: { label: 'Coral', className: 'bg-coral text-ink' },
  sky: { label: 'Sky', className: 'bg-sky text-ink' },
  mint: { label: 'Mint', className: 'bg-mint text-ink' },
};

const BLOCK_LABEL: Record<BlockType, string> = {
  paragraph: 'Text', heading: 'Heading', subheading: 'Subheading', bullet: 'Bulleted list',
  numbered: 'Numbered list', todo: 'Checklist', quote: 'Quote', divider: 'Divider',
};

const SHORTCUTS: [RegExp, BlockType][] = [
  [/^##\s/, 'subheading'], [/^#\s/, 'heading'], [/^[-*]\s/, 'bullet'], [/^1[.)]\s/, 'numbered'],
  [/^\[\s?\]\s/, 'todo'], [/^>\s/, 'quote'], [/^---$/, 'divider'],
];

const LIST_TYPES: BlockType[] = ['bullet', 'numbered', 'todo'];

export function notePreview(note: Note, max = 160) {
  return note.blocks.filter(b => b.type !== 'divider' && b.text).map(b => b.text).join(' · ').slice(0, max);
}

type Tab = 'all' | NoteKind;
const TABS: { id: Tab; label: string; plural: string }[] = [
  { id: 'all', label: 'All', plural: 'notes' },
  { id: 'everyday', label: 'Every day', plural: 'every-day notes' },
  { id: 'journal', label: 'Journal', plural: 'journal entries' },
  { id: 'note', label: 'Notes', plural: 'plain notes' },
];

const shortDate = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });

export function NotesPage() {
  const { notes, addNote, deleteNote, deleteNotes, profile } = usePlanner();
  const today = toISODate(new Date(useNow(60_000)));
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const inTab = notes.filter(n => tab === 'all' || noteKind(n) === tab);
  if (tab === 'journal') inTab.sort((a, b) => (b.journalDate ?? '').localeCompare(a.journalDate ?? ''));
  const filtered = inTab.filter(n => `${n.title} ${notePreview(n, 5000)}`.toLowerCase().includes(search.toLowerCase()));
  const current = notes.find(n => n.id === selected) ?? null;
  const tabInfo = TABS.find(t => t.id === tab) ?? TABS[0]!;

  useEffect(() => {
    if (!selected && notes[0] && window.matchMedia('(min-width: 900px)').matches) setSelected(notes[0].id);
  }, [selected, notes]);

  function openJournal(date: ISODate) {
    const existing = notes.find(n => noteKind(n) === 'journal' && n.journalDate === date);
    setSelected(existing?.id ?? addNote({ kind: 'journal', journalDate: date, title: journalTitle(date) }));
  }
  function newNote() {
    if (tab === 'journal') return openJournal(today);
    setSelected(tab === 'everyday'
      ? addNote({ kind: 'everyday', blocks: [{ id: uid(), type: 'todo', text: '' }] })
      : addNote());
  }
  function deleteAll() {
    if (!inTab.length || !confirm(`Delete all ${inTab.length} ${tabInfo.plural}${tab === 'all' ? ', including every day’s records' : ''}? This can’t be undone — export to Excel first if you want a copy.`)) return;
    deleteNotes(inTab.map(n => n.id));
    setSelected(null);
  }
  async function exportAll() {
    try { await downloadNotesWorkbook(notes, `${(profile?.name || 'My').replace(/[^\w\s-]/g, '').trim() || 'My'} notes ${today}.xlsx`); }
    catch { toast.error('Couldn’t create the Excel file. Please try again.'); }
  }

  return <>
    <PageHeading title="A place for your thoughts." subtitle="Ideas, daily checklists and a journal for every day — saved as you type." action={<div className="flex gap-2">
      <Button variant="outline" onClick={() => openJournal(today)}><BookOpen />Today’s journal</Button>
      <Button onClick={newNote}><Plus />{tab === 'everyday' ? 'New every-day note' : 'New note'}</Button>
    </div>} />
    <div className={`notes-layout ${current ? 'has-selection' : ''}`}>
      <div className="notes-list">
        <div className="flex gap-1.5 overflow-x-auto mb-3 -mx-1 px-1" role="tablist" aria-label="Note type">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`tag shrink-0 ${tab === t.id ? 'bg-primary text-primary-foreground' : ''}`}>
            {t.label} <span className="opacity-60">{t.id === 'all' ? notes.length : notes.filter(n => noteKind(n) === t.id).length}</span>
          </button>)}
        </div>
        <label className="flex items-center gap-3 mb-4"><Search size={18} className="text-muted-foreground" /><input className="field" placeholder="Search your notes…" aria-label="Search notes" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="space-y-3">
          {filtered.map(n => <button key={n.id} onClick={() => setSelected(n.id)} className={`note-card w-full text-left p-4 rounded-lg ${NOTE_COLORS[n.color].className} ${selected === n.id ? 'ring-2 ring-primary' : ''}`}>
            <p className="font-semibold truncate">{n.title || 'Untitled'}</p>
            <p className="text-xs opacity-70 mt-1.5 line-clamp-2">{notePreview(n) || 'Empty note'}</p>
            <p className="text-[10px] opacity-55 mt-2 flex items-center gap-1.5"><NoteMeta note={n} today={today} /></p>
          </button>)}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{inTab.length ? 'No notes match your search.' : tab === 'everyday' ? 'No every-day notes yet. Make one for habits like adhkar or Quran.' : tab === 'journal' ? 'No journal entries yet. Start today’s.' : 'No notes yet. Start one above.'}</p>}
        </div>
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={exportAll} disabled={!notes.length}><FileSpreadsheet size={14} />Export to Excel</Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={deleteAll} disabled={!inTab.length}><Trash2 size={14} />Delete all {tab === 'all' ? '' : tabInfo.plural}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">The Excel file opens in Google Sheets too (File → Import).</p>
      </div>
      <div className="notes-editor">
        {current
          ? <NoteEditor key={current.id} note={current} today={today} onBack={() => setSelected(null)} onDelete={() => { if (confirm(`Delete “${current.title || 'Untitled'}”${noteKind(current) === 'everyday' ? ' and all its daily records' : ''}?`)) { deleteNote(current.id); setSelected(null); } }} />
          : <div className="panel p-10 text-center text-sm text-muted-foreground hidden md:block">Pick a note or start a new one.</div>}
      </div>
    </div>
  </>;
}

function NoteMeta({ note, today }: { note: Note; today: ISODate }) {
  const kind = noteKind(note);
  if (kind === 'journal') return <><BookOpen size={11} />{note.journalDate === today ? 'Today' : note.journalDate ? shortDate(parseISODate(note.journalDate)) : 'Journal'}</>;
  if (kind === 'everyday') {
    const total = checklist(note).length;
    const done = doneOn(note, today).size;
    const s = streak(note, today);
    return <><Repeat size={11} />Every day · {done}/{total} today{s > 1 ? ` · ${s}-day streak` : ''}</>;
  }
  return <>{note.category} · {shortDate(new Date(note.updatedAt))}</>;
}

type SaveState = 'saved' | 'saving' | 'error';

function NoteEditor({ note, today, onBack, onDelete }: { note: Note; today: ISODate; onBack: () => void; onDelete: () => void }) {
  const { saveNote, storageError, prefs, notes } = usePlanner();
  const [draft, setDraft] = useState(note);
  const [status, setStatus] = useState<SaveState>('saved');
  const [focusId, setFocusId] = useState<string | null>(null);
  const pending = useRef<Note | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const kind = noteKind(draft);
  const ticked = kind === 'everyday' ? doneOn(draft, today) : null;

  function update(next: Note) {
    const synced = syncToday(next, today);
    setDraft(synced);
    pending.current = synced;
    setStatus('saving');
  }

  function setKind(next: 'note' | 'everyday') {
    const blocks = next === 'everyday' && !draft.blocks.some(b => b.type === 'todo')
      ? [...draft.blocks.filter(b => b.text || b.type === 'divider'), { id: uid(), type: 'todo' as const, text: '' }]
      : draft.blocks;
    update({ ...draft, kind: next, blocks });
  }

  function setJournalDate(date: ISODate) {
    if (!date || date > today) return;
    const clash = notes.find(n => n.id !== draft.id && noteKind(n) === 'journal' && n.journalDate === date);
    if (clash) { toast.error(`You already have a journal entry for ${journalTitle(date)}.`); return; }
    const titleWasDate = !draft.title || (draft.journalDate && draft.title === journalTitle(draft.journalDate));
    update({ ...draft, journalDate: date, title: titleWasDate ? journalTitle(date) : draft.title });
  }

  useEffect(() => {
    if (!pending.current) return;
    const t = window.setTimeout(() => {
      if (pending.current) saveNote(pending.current);
      pending.current = null;
      setStatus('saved');
    }, 600);
    return () => window.clearTimeout(t);
  }, [draft, saveNote]);

  // Flush unsaved edits when switching notes or leaving the page.
  useEffect(() => () => { if (pending.current) saveNote(pending.current); }, [saveNote]);

  useLayoutEffect(() => {
    if (!focusId) return;
    const el = refs.current.get(focusId);
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    setFocusId(null);
  }, [focusId, draft.blocks]);

  const shownStatus: SaveState = storageError ? 'error' : status;
  const setBlocks = (blocks: NoteBlock[]) => update({ ...draft, blocks: blocks.length ? blocks : [{ id: uid(), type: 'paragraph', text: '' }] });
  const patchBlock = (id: string, patch: Partial<NoteBlock>) => setBlocks(draft.blocks.map(b => (b.id === id ? { ...b, ...patch } : b)));

  function insertAfter(index: number, type: BlockType = 'paragraph') {
    const block: NoteBlock = { id: uid(), type, text: '' };
    const blocks = [...draft.blocks];
    blocks.splice(index + 1, 0, block);
    setBlocks(blocks);
    setFocusId(block.id);
  }

  function removeBlock(index: number) {
    const blocks = draft.blocks.filter((_, i) => i !== index);
    setBlocks(blocks);
    const prev = blocks[Math.max(0, index - 1)];
    if (prev) setFocusId(prev.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, block: NoteBlock, index: number) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (LIST_TYPES.includes(block.type) && !block.text) { patchBlock(block.id, { type: 'paragraph' }); return; }
      insertAfter(index, LIST_TYPES.includes(block.type) ? block.type : 'paragraph');
    } else if (e.key === 'Backspace' && !block.text && draft.blocks.length > 1) {
      e.preventDefault();
      if (block.type !== 'paragraph') patchBlock(block.id, { type: 'paragraph' });
      else removeBlock(index);
    } else if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      const mark = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[e.key.toLowerCase() as 'b' | 'i' | 'u'];
      patchBlock(block.id, { marks: { ...block.marks, [mark]: !block.marks?.[mark] } });
    }
  }

  function onText(block: NoteBlock, index: number, text: string) {
    const shortcut = block.type === 'paragraph' ? SHORTCUTS.find(([re]) => re.test(text)) : undefined;
    const prefix = shortcut && text.match(shortcut[0])?.[0];
    // Only when the prefix was just completed, so editing text that legitimately starts with "- " is left alone.
    if (shortcut && prefix && !block.text.startsWith(prefix)) {
      if (shortcut[1] === 'divider') {
        const blocks = [...draft.blocks];
        const next: NoteBlock = { id: uid(), type: 'paragraph', text: '' };
        blocks.splice(index, 1, { ...block, type: 'divider', text: '' }, next);
        setBlocks(blocks);
        setFocusId(next.id);
      } else patchBlock(block.id, { type: shortcut[1], text: text.slice(prefix.length) });
      return;
    }
    patchBlock(block.id, { text });
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = draft.blocks.findIndex(b => b.id === e.active.id);
    const to = draft.blocks.findIndex(b => b.id === e.over!.id);
    setBlocks(arrayMove(draft.blocks, from, to));
  }

  const numbers = useMemo(() => {
    let n = 0;
    return draft.blocks.map(b => (b.type === 'numbered' ? ++n : (n = 0)));
  }, [draft.blocks]);

  return <article className={`note-editor rounded-lg p-5 sm:p-7 ${NOTE_COLORS[draft.color].className}`}>
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <Button variant="ghost" size="icon" className="size-8 min-[900px]:hidden" aria-label="Back to notes" onClick={onBack}><ArrowLeft /></Button>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Note color">
        {(Object.keys(NOTE_COLORS) as NoteColor[]).map(c => <button key={c} role="radio" aria-checked={draft.color === c} aria-label={NOTE_COLORS[c].label} title={NOTE_COLORS[c].label} onClick={() => update({ ...draft, color: c })} className={`size-6 rounded-full ${NOTE_COLORS[c].className} ${draft.color === c ? 'ring-2 ring-offset-1 ring-current' : 'border border-black/15'}`} />)}
      </div>
      {kind === 'journal'
        ? <input type="date" aria-label="Journal date" className="note-select ml-1" max={today} value={draft.journalDate ?? today} onChange={e => setJournalDate(e.target.value)} />
        : <select aria-label="Note type" className="note-select ml-1" value={kind} onChange={e => setKind(e.target.value as 'note' | 'everyday')}><option value="note">Note</option><option value="everyday">Every day</option></select>}
      {kind !== 'journal' && <select aria-label="Category" className="note-select" value={draft.category} onChange={e => update({ ...draft, category: e.target.value })}>{[...new Set([...prefs.categories, draft.category])].map(c => <option key={c}>{c}</option>)}</select>}
      <span className="ml-auto text-xs opacity-70 flex items-center gap-1.5" role="status" aria-live="polite">
        {shownStatus === 'saving' && <><Loader2 size={12} className="animate-spin" />Saving…</>}
        {shownStatus === 'saved' && <><Check size={12} />Saved</>}
        {shownStatus === 'error' && <><CloudOff size={12} />Not saved yet <button className="underline" onClick={() => saveNote(draft)}>Retry</button></>}
      </span>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Delete note" title="Delete note" onClick={onDelete}><Trash2 size={15} /></Button>
    </div>
    {kind === 'everyday' && <p className="text-xs opacity-70 mb-2">Checklist items start fresh every day. Each day’s ticks are kept below.</p>}
    <input aria-label="Note title" placeholder={kind === 'everyday' ? 'e.g. Morning adhkar' : 'Untitled'} className="w-full font-semibold text-2xl bg-transparent outline-none placeholder:opacity-40 mb-3" value={draft.title} onChange={e => update({ ...draft, title: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setFocusId(draft.blocks[0]?.id ?? null); } }} />
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={draft.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {draft.blocks.map((block, i) => <BlockRow key={block.id} block={block} number={numbers[i] ?? 0}
          checked={ticked ? ticked.has(block.id) : !!block.checked}
          onCheck={v => update(ticked ? setTick(draft, today, block.id, v) : { ...draft, blocks: draft.blocks.map(b => (b.id === block.id ? { ...b, checked: v } : b)) })}
          register={el => { if (el) refs.current.set(block.id, el); else refs.current.delete(block.id); }}
          onText={t => onText(block, i, t)} onKeyDown={e => onKeyDown(e, block, i)}
          onPatch={patch => patchBlock(block.id, patch)} onDelete={() => removeBlock(i)} onAddBelow={() => insertAfter(i)} />)}
      </SortableContext>
    </DndContext>
    <button className="mt-3 text-xs opacity-60 hover:opacity-100 flex items-center gap-1.5" onClick={() => insertAfter(draft.blocks.length - 1)}><Plus size={13} />Add a block</button>
    <p className="text-[10px] opacity-50 mt-4">Tip: type # , ## , - , 1. , [] , &gt; or --- at the start of a line. Ctrl/⌘ + B, I, U to format.</p>
    {kind === 'everyday' && <EverydayHistory note={draft} today={today} onChange={update} />}
  </article>;
}

function EverydayHistory({ note, today, onChange }: { note: Note; today: ISODate; onChange: (n: Note) => void }) {
  const [picked, setPicked] = useState<ISODate | null>(null);
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const recorded = Object.keys(note.days ?? {}).length;
  const live = { done: doneOn(note, today).size, total: checklist(note).length };
  const s = streak(note, today);
  const record = picked ? note.days?.[picked] : undefined;

  return <section className="mt-6 pt-5 border-t border-current/15" aria-label="Daily record">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold text-sm">Daily record</h3>
      <p className="text-xs opacity-75">Today {live.done}/{live.total}{s ? ` · ${s}-day streak` : ''} · {recorded} {recorded === 1 ? 'day' : 'days'} recorded</p>
    </div>
    <div className="history-grid mt-3" role="list">
      {days.map(d => {
        const p = d === today ? live : dayProgress(note.days?.[d]);
        const pct = p.total ? 22 + Math.round((p.done / p.total) * 68) : 6;
        return <button key={d} role="listitem" onClick={() => setPicked(picked === d ? null : d)}
          aria-label={`${journalTitle(d)}: ${p.total ? `${p.done} of ${p.total} done` : 'no record'}`}
          className={`history-cell ${picked === d ? 'picked' : ''} ${d === today ? 'today' : ''}`}
          style={{ background: `color-mix(in srgb, currentColor ${note.days?.[d] || d === today ? pct : 6}%, transparent)` }} />;
      })}
    </div>
    <p className="text-[10px] opacity-55 mt-2">Last 4 weeks — darker means more done. Tap a day to see it.</p>
    {picked && <div className="mt-3 text-sm">
      <p className="font-medium">{journalTitle(picked)}</p>
      {record && record.items.length
        ? <ul className="mt-2 space-y-1">{record.items.map(i => <li key={i.id} className="flex items-center gap-2">{i.done ? <Check size={14} /> : <span className="size-3.5 rounded-sm border border-current opacity-50" />}<span className={i.done ? '' : 'opacity-60'}>{i.text || 'Untitled item'}</span></li>)}</ul>
        : <p className="text-xs opacity-65 mt-1">Nothing was ticked this day.</p>}
      {record && <button className="text-xs underline opacity-75 hover:opacity-100 mt-2" onClick={() => { if (confirm(`Delete the record for ${journalTitle(picked)}?`)) { onChange(deleteDay(note, picked)); setPicked(null); } }}>Delete this day’s record</button>}
    </div>}
    {recorded > 0 && <button className="text-xs underline opacity-60 hover:opacity-100 mt-3 block" onClick={() => { if (confirm(`Delete all ${recorded} days of records for this note? The checklist itself stays.`)) { onChange({ ...note, days: {} }); setPicked(null); } }}>Clear all history</button>}
  </section>;
}

function BlockRow({ block, number, checked, onCheck, register, onText, onKeyDown, onPatch, onDelete, onAddBelow }: {
  block: NoteBlock; number: number; checked: boolean;
  onCheck: (v: boolean) => void;
  register: (el: HTMLTextAreaElement | null) => void;
  onText: (t: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPatch: (p: Partial<NoteBlock>) => void;
  onDelete: () => void;
  onAddBelow: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const area = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (el) { el.style.height = '0px'; el.style.height = `${el.scrollHeight}px`; }
  }, [block.text, block.type]);

  const m = block.marks ?? {};
  const toggle = (k: keyof BlockMarks) => onPatch({ marks: { ...m, [k]: !m[k] } });
  const textClass = [
    `block-${block.type}`,
    m.bold && 'font-bold', m.italic && 'italic',
    [m.underline && 'underline', m.strike && 'line-through'].filter(Boolean).join(' '),
    block.type === 'todo' && checked && 'line-through opacity-60',
  ].filter(Boolean).join(' ');

  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`note-block group ${isDragging ? 'opacity-60 z-10 relative' : ''}`}>
    <div className="block-tools">
      <button className="block-handle" aria-label="Drag to reorder block" title="Drag to reorder" {...attributes} {...listeners}><GripVertical size={14} /></button>
      <button className="block-handle" aria-label="Add block below" title="Add block below" onClick={onAddBelow}><Plus size={14} /></button>
    </div>
    {block.type === 'divider'
      ? <hr className="flex-1 my-3 border-current opacity-25" />
      : <div className="flex-1 flex items-start gap-2 min-w-0">
          {block.type === 'bullet' && <span className="mt-[3px] select-none" aria-hidden>•</span>}
          {block.type === 'numbered' && <span className="mt-[2px] select-none tabular-nums min-w-4 text-right" aria-hidden>{number}.</span>}
          {block.type === 'todo' && <input type="checkbox" className="mt-1.5 size-4 accent-current" aria-label={checked ? 'Mark unchecked' : 'Mark done'} checked={checked} onChange={e => onCheck(e.target.checked)} />}
          <textarea ref={el => { area.current = el; register(el); }} rows={1} aria-label={BLOCK_LABEL[block.type]} placeholder={block.type === 'paragraph' ? 'Write something…' : BLOCK_LABEL[block.type]}
            className={`note-text ${textClass}`} value={block.text} onChange={e => onText(e.target.value)} onKeyDown={onKeyDown} />
        </div>}
    <div className="block-menu">
      <select aria-label="Block type" className="note-select" value={block.type} onChange={e => onPatch({ type: e.target.value as BlockType })}>{Object.entries(BLOCK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {block.type !== 'divider' && <>
        <button aria-pressed={!!m.bold} title="Bold" aria-label="Bold" className={`fmt ${m.bold ? 'on' : ''}`} onClick={() => toggle('bold')}><Bold size={13} /></button>
        <button aria-pressed={!!m.italic} title="Italic" aria-label="Italic" className={`fmt ${m.italic ? 'on' : ''}`} onClick={() => toggle('italic')}><Italic size={13} /></button>
        <button aria-pressed={!!m.underline} title="Underline" aria-label="Underline" className={`fmt ${m.underline ? 'on' : ''}`} onClick={() => toggle('underline')}><Underline size={13} /></button>
        <button aria-pressed={!!m.strike} title="Strikethrough" aria-label="Strikethrough" className={`fmt ${m.strike ? 'on' : ''}`} onClick={() => toggle('strike')}><Strikethrough size={13} /></button>
      </>}
      <button title="Delete block" aria-label="Delete block" className="fmt" onClick={onDelete}><Trash2 size={13} /></button>
    </div>
  </div>;
}
