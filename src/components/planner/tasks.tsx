import { useMemo, useState, type FormEvent } from 'react';
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RECURRENCE_LABEL, STATUS_LABEL, occurrencesBetween, occurrencesOn } from '@/lib/daywell/tasks';
import { addDays, formatRange, parseISODate, toISODate } from '@/lib/daywell/time';
import type { Recurrence, Task, TaskOccurrence, TaskStatus } from '@/lib/daywell/types';
import { Modal, PageHeading } from './shell';
import { useNow, usePlanner } from './state';

const STATUS_CLASS: Record<TaskStatus, string> = {
  upcoming: '',
  in_progress: 'bg-lime text-ink',
  overdue: 'bg-coral text-ink',
  completed: 'opacity-70',
};
const CATEGORY_CLASS: Record<string, string> = { Study: 'bg-lilac text-ink', Work: 'bg-yellow text-ink', Health: 'bg-lime text-ink', Ideas: 'bg-coral text-ink' };
const REMINDER_OPTIONS = [null, 0, 5, 10, 15, 30, 60, 120];

export function TaskRow({ occ, showDate }: { occ: TaskOccurrence; showDate?: boolean }) {
  const { setOccurrenceStatus, deleteTask } = usePlanner();
  const [editing, setEditing] = useState(false);
  const { task, status, date } = occ;
  const done = status === 'completed';
  return <div className="task-row group">
    <Button variant="ghost" size="icon" className={`check-control size-6 ${done ? 'done' : ''}`} aria-label={`${done ? 'Reopen' : 'Complete'} ${task.title}`} onClick={() => setOccurrenceStatus(task.id, date, done ? null : 'completed')}>{done && <Check size={14} />}</Button>
    <div className="min-w-0 flex-1">
      <p className={`text-sm font-medium ${done ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p>
      <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5"><Clock3 size={11} />{showDate && `${parseISODate(date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · `}{formatRange(task.start, task.end)}</span>
        {task.recurrence !== 'none' && <span className="flex items-center gap-1" title={RECURRENCE_LABEL[task.recurrence]}><Repeat size={11} />{RECURRENCE_LABEL[task.recurrence]}</span>}
        {task.reminderMinutes != null && <span className="flex items-center gap-1" title="Reminder set"><Bell size={11} />{task.reminderMinutes ? `${task.reminderMinutes}m before` : 'At start'}</span>}
      </p>
      {task.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{task.description}</p>}
    </div>
    {status !== 'upcoming' && <span className={`tag whitespace-nowrap ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>}
    <span className={`tag ${CATEGORY_CLASS[task.category] ?? ''}`}>{task.category}</span>
    <div className="flex">
      {status === 'upcoming' && <Button variant="ghost" size="icon" className="size-8" title="Start now" aria-label={`Start ${task.title} now`} onClick={() => setOccurrenceStatus(task.id, date, 'in_progress')}><Play size={14} /></Button>}
      <Button variant="ghost" size="icon" className="size-8" title="Edit" aria-label={`Edit ${task.title}`} onClick={() => setEditing(true)}><Pencil size={14} /></Button>
      <Button variant="ghost" size="icon" className="size-8" title="Delete" aria-label={`Delete ${task.title}`} onClick={() => { if (confirm(task.recurrence === 'none' ? `Delete “${task.title}”?` : `Delete “${task.title}” and all its repeats?`)) deleteTask(task.id); }}><Trash2 size={14} /></Button>
    </div>
    {editing && <TaskDialog task={task} onClose={() => setEditing(false)} />}
  </div>;
}

export function TaskDialog({ task, defaultDate, onClose }: { task?: Task; defaultDate?: string; onClose: () => void }) {
  const { prefs, updatePrefs, addTask, updateTask } = usePlanner();
  const now = new Date();
  const today = toISODate(now);
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const startHour = now.getHours() + 1;
  const wanted = defaultDate && defaultDate > today ? defaultDate : today;
  // After 11 PM there's no full hour left today, so new tasks default to tomorrow.
  const initialDate = task?.date ?? (wanted === today && startHour >= 24 ? addDays(today, 1) : wanted);
  // Existing tasks may keep their original (past) date, but nothing can move earlier than that.
  const minDate = task && task.date < today ? task.date : today;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [category, setCategory] = useState(task?.category ?? 'Personal');
  const [newCategory, setNewCategory] = useState('');
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(task?.start ?? `${String(startHour % 24).padStart(2, '0')}:00`);
  const [end, setEnd] = useState(task?.end ?? (startHour === 23 ? '23:59' : `${String((startHour + 1) % 24).padStart(2, '0')}:00`));
  const [reminder, setReminder] = useState<number | null>(task ? task.reminderMinutes : prefs.reminders.defaultTaskMinutes);
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'none');
  const [until, setUntil] = useState(task?.recurrenceUntil ?? '');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (end <= start) { setError('End time should be after the start time.'); return; }
    const timingChanged = !task || task.date !== date || task.start !== start || task.end !== end;
    if (timingChanged && date < minDate) { setError('Tasks can’t be planned for a day that has already passed.'); return; }
    if (timingChanged && date === today && end <= hhmm(now)) { setError('That time has already passed today. Pick a later time or another day.'); return; }
    let cat = category;
    if (category === '__new') {
      cat = newCategory.trim();
      if (!cat) { setError('Name your new category.'); return; }
      if (!prefs.categories.includes(cat)) updatePrefs(p => ({ ...p, categories: [...p.categories, cat] }));
    }
    const data = { title: title.trim(), description: description.trim(), category: cat, date, start, end, reminderMinutes: reminder, recurrence, recurrenceUntil: recurrence !== 'none' && until ? until : null };
    if (task) updateTask(task.id, data); else addTask(data);
    onClose();
  }

  return <Modal title={task ? 'Edit task' : 'A little plan for your day'} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">Title<input autoFocus required maxLength={120} className="field mt-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="What’s on your mind?" /></label>
      <label className="block text-sm">Description <span className="text-muted-foreground">(optional)</span><textarea className="field mt-2 min-h-16" maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Category<select className="field mt-2" value={category} onChange={e => setCategory(e.target.value)}>{prefs.categories.map(c => <option key={c}>{c}</option>)}<option value="__new">+ New category…</option></select></label>
        <label className="block text-sm">Date<input type="date" required min={minDate} className="field mt-2" value={date} onChange={e => setDate(e.target.value)} /></label>
      </div>
      {category === '__new' && <label className="block text-sm">New category name<input className="field mt-2" maxLength={30} value={newCategory} onChange={e => setNewCategory(e.target.value)} /></label>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Start time<input type="time" required className="field mt-2" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="block text-sm">End time<input type="time" required className="field mt-2" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Reminder<select className="field mt-2" value={reminder ?? 'none'} onChange={e => setReminder(e.target.value === 'none' ? null : Number(e.target.value))}>{REMINDER_OPTIONS.map(m => <option key={String(m)} value={m ?? 'none'}>{m == null ? 'No reminder' : m === 0 ? 'At start time' : m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''} before` : `${m} min before`}</option>)}</select></label>
        <label className="block text-sm">Repeat<select className="field mt-2" value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrence)}>{Object.entries(RECURRENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      {recurrence !== 'none' && <label className="block text-sm">Repeat until <span className="text-muted-foreground">(optional)</span><input type="date" min={date} className="field mt-2" value={until} onChange={e => setUntil(e.target.value)} /></label>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit">{task ? <><Check /> Save changes</> : <><Plus /> Create task</>}</Button>
    </form>
  </Modal>;
}

type View = 'day' | 'upcoming' | 'completed';
const STATUS_FILTERS: (TaskStatus | 'all')[] = ['all', 'upcoming', 'in_progress', 'overdue', 'completed'];

export function TasksPage() {
  const { tasks, prefs } = usePlanner();
  const now = useNow(30_000);
  const today = toISODate(new Date(now));
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');

  const list = useMemo(() => {
    let occ: TaskOccurrence[];
    if (view === 'day') occ = occurrencesOn(tasks, date, now);
    else if (view === 'upcoming') occ = occurrencesBetween(tasks, today, 14, now).filter(o => o.status === 'upcoming' || o.status === 'in_progress');
    else occ = occurrencesBetween(tasks, addDays(today, -60), 61, now).filter(o => o.status === 'completed').reverse();
    return occ.filter(o => (category === 'All' || o.task.category === category) && (view !== 'day' || status === 'all' || o.status === status));
  }, [tasks, view, date, today, now, category, status]);

  const isPast = view === 'day' && date < today;
  const dayLabel = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : parseISODate(date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return <>
    <PageHeading title="Make room for what matters." subtitle="Plan your tasks, classes, and personal time — at your own pace." action={<Button onClick={() => setAdding(true)}><Plus />Add task</Button>} />
    <div className="flex flex-wrap gap-2 mb-5">{(['day', 'upcoming', 'completed'] as View[]).map(v => <Button key={v} variant={view === v ? 'default' : 'secondary'} onClick={() => setView(v)}>{v === 'day' ? 'By day' : v === 'upcoming' ? 'Upcoming' : 'Completed'}</Button>)}</div>
    <div className="panel p-5 max-w-4xl">
      {view === 'day' && <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Previous day" onClick={() => setDate(d => addDays(d, -1))}><ChevronLeft /></Button>
          <h2 className="section-title min-w-36 text-center">{dayLabel}</h2>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Next day" onClick={() => setDate(d => addDays(d, 1))}><ChevronRight /></Button>
        </div>
        <div className="flex items-center gap-2">
          {date !== today && <Button variant="secondary" size="sm" onClick={() => setDate(today)}>Today</Button>}
          <input type="date" aria-label="Pick a date" className="field w-auto py-1.5" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        </div>
      </div>}
      <div className="flex flex-wrap gap-1.5 mb-2">{['All', ...prefs.categories].map(c => <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
      {view === 'day' && <div className="flex flex-wrap gap-1.5 mb-2">{STATUS_FILTERS.map(s => <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s === 'all' ? 'Any status' : STATUS_LABEL[s]}</button>)}</div>}
      <div className="mt-2">
        {list.map(o => <TaskRow key={`${o.task.id}@${o.date}`} occ={o} showDate={view !== 'day'} />)}
        {list.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{view === 'completed' ? 'Nothing completed yet — you’ve got this.' : isPast ? 'Nothing was planned for this day.' : 'A little room for new plans.'}</p>}
      </div>
      {!isPast && <Button variant="ghost" className="w-full mt-3 text-muted-foreground text-xs" onClick={() => setAdding(true)}><Plus size={14} /> Add to {view === 'day' ? dayLabel.toLowerCase() : 'your plans'}</Button>}
    </div>
    {adding && <TaskDialog defaultDate={view === 'day' && !isPast ? date : today} onClose={() => setAdding(false)} />}
  </>;
}
