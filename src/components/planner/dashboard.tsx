import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpRight, Bell, ChevronDown, ChevronUp, Clock3, Eye, EyeOff, GraduationCap, GripVertical, ListTodo, NotebookPen, Plus, RotateCcw, Wallet } from 'lucide-react';
import { NamazIcon } from './namaz-icon';
import { Button } from '@/components/ui/button';
import { budgetSummary, formatTaka, monthOf } from '@/lib/daywell/budget';
import { classesOn, classLabel } from '@/lib/daywell/classes';
import { BLOCK_TITLES, DEFAULT_LAYOUT } from '@/lib/daywell/layout';
import { PRAYERS, nextPrayer, prayerTimesFor } from '@/lib/daywell/prayer';
import { buildReminders } from '@/lib/daywell/reminders';
import { occurrencesBetween, occurrencesOn } from '@/lib/daywell/tasks';
import { addDays, formatClock, formatLongDate, formatRelative, greetingFor, toISODate } from '@/lib/daywell/time';
import type { BlockSize, DashboardBlock, DashboardBlockId } from '@/lib/daywell/types';
import balance from '@/assets/balance.jpg';
import { ClassTimerCard, TodaysClasses } from './classes';
import { Prayers } from './namaz';
import { NOTE_COLORS, notePreview } from './notes';
import { UpcomingList } from './notifications';
import { useNow, usePlanner } from './state';
import { TaskDialog, TaskRow } from './tasks';

const SIZES: { id: BlockSize; label: string }[] = [{ id: 'sm', label: 'Small' }, { id: 'md', label: 'Half' }, { id: 'lg', label: 'Wide' }, { id: 'full', label: 'Full' }];

export function Dashboard() {
  const { layout, sessions } = usePlanner();
  const visible = useMemo(() => layout
    .filter(b => b.visible && !(b.id === 'classes' && sessions.length === 0))
    .sort((a, b) => a.order - b.order), [layout, sessions.length]);
  return <>
    <div className="dash-grid">
      {visible.map(b => <section key={b.id} aria-label={BLOCK_TITLES[b.id]} className={`dash-block size-${b.size}`}><BlockContent id={b.id} /></section>)}
    </div>
    {visible.length === 0 && <div className="panel p-10 text-center text-sm text-muted-foreground">Your home screen is empty. Choose what to show in <Link to="/settings" className="underline">Settings</Link>.</div>}
  </>;
}

export function DashboardSettings() {
  const { layout, setLayout } = usePlanner();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = useMemo(() => [...layout].sort((a, b) => a.order - b.order), [layout]);
  const update = (id: DashboardBlockId, patch: Partial<DashboardBlock>) => setLayout(l => l.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const move = (from: number, to: number) => { if (to >= 0 && to < ordered.length) setLayout(arrayMove(ordered, from, to).map((b, order) => ({ ...b, order }))); };
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    move(ordered.findIndex(b => b.id === e.active.id), ordered.findIndex(b => b.id === e.over!.id));
  }
  return <div>
    <div className="flex items-center justify-between gap-3 mb-1">
      <h2 className="section-title">Home screen</h2>
      <Button variant="ghost" size="sm" onClick={() => { if (confirm('Restore the default home screen?')) setLayout(DEFAULT_LAYOUT); }}><RotateCcw size={14} />Restore default</Button>
    </div>
    <p className="text-xs text-muted-foreground mb-3">Choose what appears on Overview and in what order.</p>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ordered.map(b => b.id)} strategy={verticalListSortingStrategy}>
        <ul className="layout-list">
          {ordered.map((b, i) => <LayoutRow key={b.id} block={b} first={i === 0} last={i === ordered.length - 1}
            onUp={() => move(i, i - 1)} onDown={() => move(i, i + 1)} onSize={size => update(b.id, { size })} onToggle={() => update(b.id, { visible: !b.visible })} />)}
        </ul>
      </SortableContext>
    </DndContext>
  </div>;
}

function LayoutRow({ block, first, last, onUp, onDown, onSize, onToggle }: { block: DashboardBlock; first: boolean; last: boolean; onUp: () => void; onDown: () => void; onSize: (s: BlockSize) => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const title = BLOCK_TITLES[block.id];
  return <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`layout-row ${isDragging ? 'dragging' : ''} ${block.visible ? '' : 'is-hidden'}`}>
    <button ref={setActivatorNodeRef} className="block-handle" aria-label={`Move ${title}`} {...attributes} {...listeners}><GripVertical size={15} /></button>
    <span className="flex-1 min-w-0 truncate text-sm">{title}</span>
    <select aria-label={`${title} width`} className="field w-auto py-1 text-xs layout-size" value={block.size} onChange={e => onSize(e.target.value as BlockSize)}>{SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
    <button className="block-handle" aria-label={`Move ${title} up`} disabled={first} onClick={onUp}><ChevronUp size={15} /></button>
    <button className="block-handle" aria-label={`Move ${title} down`} disabled={last} onClick={onDown}><ChevronDown size={15} /></button>
    <button className="block-handle" aria-label={block.visible ? `Hide ${title}` : `Show ${title}`} aria-pressed={block.visible} onClick={onToggle}>{block.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
  </li>;
}

function BlockContent({ id }: { id: DashboardBlockId }) {
  switch (id) {
    case 'greeting': return <GreetingBlock />;
    case 'stats': return <StatsBlock />;
    case 'today': return <TodayBlock />;
    case 'upcoming': return <UpcomingBlock />;
    case 'namaz': return <NamazBlock />;
    case 'classes': return <Section title="Today’s classes" link="/classes" linkLabel="Routine"><div className="panel px-5 py-1"><TodaysClasses /></div></Section>;
    case 'activeClass': return <Section title="Class countdown" link="/classes" linkLabel="Classes"><ClassTimerCard compact /></Section>;
    case 'notes': return <NotesBlock />;
    case 'reminders': return <RemindersBlock />;
    case 'inspiration': return <div className="banner"><img src={balance} width={1152} height={576} alt="A little green plant with playful everyday shapes" /><div className="banner-copy"><span className="text-[10px] font-medium">ROOM TO GROW</span><h3 className="font-semibold text-xl mt-2">Progress, not perfection.</h3><p className="text-xs mt-2 opacity-75">Small steps make a meaningful day.</p></div></div>;
  }
}

function Section({ title, link, linkLabel, children }: { title: string; link: '/tasks' | '/namaz' | '/classes' | '/notes' | '/settings'; linkLabel: string; children: ReactNode }) {
  return <>
    <div className="flex items-center justify-between mb-4 gap-3"><h2 className="section-title">{title}</h2><Link to={link} className="text-xs text-muted-foreground flex gap-1.5 items-center hover:text-foreground">{linkLabel} <ArrowUpRight size={14} /></Link></div>
    {children}
  </>;
}

function GreetingBlock() {
  const { profile } = usePlanner();
  const now = useNow(60_000);
  const [adding, setAdding] = useState(false);
  const date = new Date(now);
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div><h1 className="page-title">{greetingFor(date, profile?.name ?? '')}</h1><p className="text-muted-foreground text-sm mt-2.5">A little focus. A little balance. A day that’s yours.</p></div>
    <div className="flex items-center gap-4"><span className="header-date text-xs text-muted-foreground">{formatLongDate(date)}</span><Button onClick={() => setAdding(true)}><Plus /> Add task</Button></div>
    {adding && <TaskDialog onClose={() => setAdding(false)} />}
  </div>;
}

function StatsBlock() {
  const { tasks, prayers, expenses, sessions, prefs } = usePlanner();
  const now = useNow(60_000);
  const today = toISODate(new Date(now));
  const occ = occurrencesOn(tasks, today, now);
  const done = occ.filter(o => o.status === 'completed').length;
  const budget = budgetSummary(expenses, prefs.budget, monthOf(today), today);
  const classes = classesOn(sessions, today);
  const nextClass = classes.find(c => c.scheduledStart > now);
  const stats = [
    { title: 'Today’s tasks', number: `${done}`, suffix: `/ ${occ.length}`, bottom: occ.length ? `${Math.round((done / occ.length) * 100)}% of your day, well spent` : 'Nothing planned yet', icon: ListTodo, color: 'bg-lime', link: '/tasks' as const, progress: true },
    { title: 'Namaz tracker', number: `${prayers.length}`, suffix: '/ 5 prayers', bottom: 'One prayer at a time', icon: NamazIcon, color: 'bg-yellow', link: '/namaz' as const },
    { title: 'Spent today', number: formatTaka(budget.todaySpent), suffix: '', icon: Wallet, color: 'bg-coral', link: '/expenses' as const,
      bottom: budget.status === 'unset' ? 'Set a monthly budget' : budget.safeToday >= 0 ? `${formatTaka(budget.safeToday)} left to spend today` : `${formatTaka(-budget.safeToday)} over today’s share` },
    { title: 'Classes today', number: `${classes.length}`, suffix: classes.length === 1 ? 'class' : 'classes', bottom: nextClass ? `Next: ${classLabel(nextClass.session)}` : classes.length ? 'All done for today' : 'A free day', icon: GraduationCap, color: 'bg-lilac', link: '/classes' as const },
  ];
  return <div className="overview-grid">{stats.map(s => <Link to={s.link} key={s.title} className={`stat-card ${s.color}`}>
    <span className="stat-icon"><s.icon size={17} /></span>
    <p className="text-sm font-medium">{s.title}</p>
    <div className="stat-value mt-5 mb-4 flex items-baseline gap-1.5"><span className="stat-number text-[34px] leading-none font-semibold">{s.number}</span><span className="text-xs opacity-65">{s.suffix}</span></div>
    {s.progress && <div className="progress-track mb-2"><progress max={Math.max(1, occ.length)} value={done} /></div>}
    <p className="text-[11px] opacity-75 truncate">{s.bottom}</p>
  </Link>)}</div>;
}

function TodayBlock() {
  const { tasks } = usePlanner();
  const now = useNow(30_000);
  const [adding, setAdding] = useState(false);
  const occ = occurrencesOn(tasks, toISODate(new Date(now)), now);
  const done = occ.filter(o => o.status === 'completed').length;
  return <Section title="Your day, at a glance" link="/tasks" linkLabel="All tasks">
    <div className="panel p-5">
      <div className="flex justify-between items-center border-b border-border pb-3"><span className="text-xs text-muted-foreground">TODAY’S PLAN <span className="ml-2">{occ.length} tasks</span></span><span className="text-[11px] text-muted-foreground">{done} completed</span></div>
      {occ.slice(0, 8).map(o => <TaskRow key={o.task.id} occ={o} />)}
      {occ.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">A little room for new plans.</p>}
      {occ.length > 8 && <Link to="/tasks" className="block text-center text-xs text-muted-foreground mt-3">+{occ.length - 8} more</Link>}
      <Button variant="ghost" className="w-full mt-3 text-muted-foreground text-xs" onClick={() => setAdding(true)}><Plus size={14} /> Add to your day</Button>
    </div>
    {adding && <TaskDialog onClose={() => setAdding(false)} />}
  </Section>;
}

function UpcomingBlock() {
  const { tasks, sessions, prefs, layout } = usePlanner();
  const now = useNow(30_000);
  const prayersShown = layout.some(b => b.id === 'namaz' && b.visible);
  const items = useMemo(() => {
    const today = toISODate(new Date(now));
    const horizon = now + 2 * 86_400_000;
    const list: { key: string; title: string; at: number; meta: string; icon: typeof Clock3 }[] = [];
    for (const o of occurrencesBetween(tasks, today, 3, now)) if (o.status === 'upcoming' && o.startAt.getTime() < horizon) list.push({ key: `t${o.task.id}${o.date}`, title: o.task.title, at: o.startAt.getTime(), meta: o.task.category, icon: ListTodo });
    for (let i = 0; i < 3; i++) for (const c of classesOn(sessions, addDays(today, i))) if (c.scheduledStart > now && c.scheduledStart < horizon) list.push({ key: c.key, title: classLabel(c.session), at: c.scheduledStart, meta: c.session.room || 'Class', icon: GraduationCap });
    if (!prayersShown) for (let i = 0; i < 2; i++) {
      const t = prayerTimesFor(prefs.prayer, new Date(now), i);
      for (const p of PRAYERS) if (t[p].getTime() > now && t[p].getTime() < horizon) list.push({ key: `p${p}${i}`, title: p, at: t[p].getTime(), meta: 'Namaz', icon: NamazIcon });
    }
    return list.sort((a, b) => a.at - b.at).slice(0, 5);
  }, [tasks, sessions, prefs.prayer, prayersShown, now]);
  return <Section title="Coming up next" link="/tasks" linkLabel="Plans">
    <div className="panel px-5 py-1">
      {items.map(i => <div key={i.key} className="task-row">
        <div className="size-9 rounded-lg bg-secondary grid place-items-center shrink-0"><i.icon size={16} /></div>
        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{i.title}</p><p className="text-xs text-muted-foreground mt-1">{i.meta}</p></div>
        <div className="text-right"><p className="text-xs">{formatClock(new Date(i.at))}</p><p className="text-[10px] text-muted-foreground mt-1">{formatRelative(i.at - now)}</p></div>
      </div>)}
      {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing in the next two days.</p>}
    </div>
  </Section>;
}

function NamazBlock() {
  const { prefs, prayers } = usePlanner();
  const now = useNow(30_000);
  const next = nextPrayer(prefs.prayer, new Date(now));
  return <Section title="A moment for Namaz" link="/namaz" linkLabel="Namaz">
    <div className="panel p-5">
      <div className="flex items-center justify-between border-b border-border pb-4 gap-2"><div><span className="text-[10px] text-muted-foreground">NEXT PRAYER</span><p className="font-semibold mt-1">{next.name} <span className="text-xs text-muted-foreground font-normal ml-1">{formatClock(next.at, prefs.prayer.timeZone)} · {formatRelative(next.at.getTime() - now)}</span></p></div><span className="tag bg-yellow text-ink truncate max-w-32">{prefs.prayer.locationName.split(',')[0]} · {prefs.prayer.madhab === 'hanafi' ? 'Hanafi' : 'Standard'}</span></div>
      <Prayers compact />
      <p className="text-[10px] text-muted-foreground pt-3">{prayers.length} of 5 recorded today</p>
    </div>
  </Section>;
}

function NotesBlock() {
  const { notes } = usePlanner();
  const recent = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 2);
  return <Section title="A note to self" link="/notes" linkLabel="All notes">
    <div className="grid gap-3">
      {recent.map(n => <Link key={n.id} to="/notes" className={`block rounded-lg p-5 ${NOTE_COLORS[n.color].className}`}><NotebookPen size={18} className="mb-3 opacity-65" /><h3 className="text-base font-semibold">{n.title || 'Untitled'}</h3><p className="text-xs leading-relaxed mt-2 opacity-75 line-clamp-3">{notePreview(n)}</p><p className="text-[10px] opacity-60 mt-3">{n.category} · {new Date(n.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</p></Link>)}
      {recent.length === 0 && <Link to="/notes" className="panel p-6 text-sm text-muted-foreground text-center">Start your first note</Link>}
    </div>
  </Section>;
}

function RemindersBlock() {
  const { inbox, tasks, sessions, prefs } = usePlanner();
  const now = useNow(30_000);
  const upcoming = useMemo(() => buildReminders({ tasks, sessions, prefs }, now, now, now + 86_400_000).slice(0, 3), [tasks, sessions, prefs, now]);
  const unread = inbox.filter(i => !i.read).length;
  return <Section title="Reminders" link="/settings" linkLabel="Settings">
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-sm border-b border-border pb-3"><Bell size={15} />{prefs.reminders.enabled ? (unread ? `${unread} new in your inbox` : 'You’re all caught up') : 'Reminders are off'}</div>
      <UpcomingList items={upcoming} now={now} />
    </div>
  </Section>;
}
