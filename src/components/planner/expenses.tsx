import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Bike, BookOpen, Bus, ChevronLeft, ChevronRight, Coffee, HeartPulse, Pencil, Plus, Receipt, ShoppingBag, Target, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  EXPENSE_CATEGORIES, budgetSummary, categoryBreakdown, dailySeries, formatTaka, limitWarnings, monthLabel, monthOf,
  samePeriodLastMonth, shiftMonth, type BudgetSummary,
} from '@/lib/daywell/budget';
import { parseISODate, toISODate } from '@/lib/daywell/time';
import type { Expense } from '@/lib/daywell/types';
import { Modal, PageHeading } from './shell';
import { useNow, usePlanner } from './state';

const CATEGORY_ICON: Record<string, typeof Coffee> = {
  Food: Coffee, Transport: Bus, Shopping: ShoppingBag, Bills: Receipt, Education: BookOpen, Health: HeartPulse, Fun: Bike,
};
const STATUS_CLASS = { unset: '', ok: '', warning: 'warning', over: 'over' } as const;

export function ExpensesPage() {
  const { expenses, setExpenses, prefs } = usePlanner();
  const now = useNow(60_000);
  const today = toISODate(new Date(now));
  const [month, setMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [filter, setFilter] = useState('All');

  const s = budgetSummary(expenses, prefs.budget, month, today);
  const categories = useMemo(() => categoryBreakdown(expenses, prefs.budget, month), [expenses, prefs.budget, month]);
  const list = useMemo(() => expenses
    .filter(e => monthOf(e.date) === month && (filter === 'All' || e.category === filter))
    .sort((a, b) => b.date.localeCompare(a.date)), [expenses, month, filter]);
  const byDay = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    for (const e of list) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
    return [...groups];
  }, [list]);

  return <>
    <PageHeading title="Know where your money goes." subtitle="Set a monthly limit and see, day by day, whether you’re on track." action={<Button onClick={() => setEditing('new')}><Plus />Add expense</Button>} />
    <div className="flex items-center gap-2 mb-5">
      <Button variant="ghost" size="icon" className="size-8" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft /></Button>
      <h2 className="section-title min-w-40 text-center">{monthLabel(month)}</h2>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Next month" disabled={s.isCurrent} onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight /></Button>
      {!s.isCurrent && <Button variant="secondary" size="sm" onClick={() => setMonth(monthOf(today))}>This month</Button>}
    </div>

    <div className="grid gap-5 max-w-5xl">
      <BudgetHero s={s} onEdit={() => setBudgetOpen(true)} />
      {s.isCurrent && <QuickStats s={s} lastMonth={samePeriodLastMonth(expenses, month, s.dayOfMonth)} />}
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <DailyChart s={s} series={dailySeries(expenses, month)} today={today} />
        <CategoryPanel categories={categories} total={s.spent} onEdit={() => setBudgetOpen(true)} />
      </div>

      <section>
        <h2 className="section-title mb-3">Transactions</h2>
        <div className="flex flex-wrap gap-1.5 mb-3">{['All', ...new Set([...EXPENSE_CATEGORIES.filter(c => categories.some(x => x.category === c)), ...categories.map(c => c.category)])].map(c =>
          <button key={c} className={`chip ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>{c}</button>)}</div>
        <div className="panel px-5 py-1">
          {byDay.map(([date, items]) => <div key={date}>
            <div className="flex justify-between text-[11px] text-muted-foreground pt-4 pb-1">
              <span>{date === today ? 'Today' : parseISODate(date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span>{formatTaka(items.reduce((a, e) => a + e.amount, 0))}</span>
            </div>
            {items.map(e => {
              const Icon = CATEGORY_ICON[e.category] ?? Wallet;
              return <div key={e.id} className="task-row">
                <div className="bg-secondary size-10 grid place-items-center rounded-lg shrink-0"><Icon size={18} /></div>
                <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(e)} aria-label={`Edit ${e.title}`}>
                  <h3 className="text-sm font-medium truncate">{e.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{e.category}</p>
                </button>
                <span className="font-semibold whitespace-nowrap">{formatTaka(e.amount)}</span>
                <Button variant="ghost" size="icon" aria-label={`Delete ${e.title}`} onClick={() => setExpenses(p => p.filter(x => x.id !== e.id))}><Trash2 /></Button>
              </div>;
            })}
          </div>)}
          {list.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{filter === 'All' ? 'No spending logged for this month.' : `No ${filter} spending this month.`}</p>}
        </div>
      </section>
    </div>

    {editing && <ExpenseDialog expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    {budgetOpen && <BudgetDialog onClose={() => setBudgetOpen(false)} />}
  </>;
}

function BudgetHero({ s, onEdit }: { s: BudgetSummary; onEdit: () => void }) {
  if (s.status === 'unset') {
    return <div className="panel p-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs text-muted-foreground">SPENT IN {monthLabel(s.month).toUpperCase()}</p>
        <p className="text-3xl font-semibold mt-2">{formatTaka(s.spent)}</p>
        <p className="text-sm text-muted-foreground mt-2">Set a monthly budget to see whether you’re spending within your limit.</p>
      </div>
      <Button onClick={onEdit}><Target />Set a budget</Button>
    </div>;
  }
  const expectedPct = s.isCurrent ? (s.dayOfMonth / s.days) * 100 : 100;
  const after = s.daysLeft - 1;
  const perDay = after > 0 ? `${formatTaka(s.remaining / after)} a day from tomorrow` : `${formatTaka(s.remaining)} for the rest of today`;
  const message = !s.isCurrent
    ? s.spent > s.limit ? `You went ${formatTaka(s.spent - s.limit)} over your budget this month.` : `You stayed within budget, with ${formatTaka(s.remaining)} to spare.`
    : s.status === 'over' ? `You’re ${formatTaka(s.spent - s.limit)} over this month’s budget${after > 0 ? `, with ${after} day${after === 1 ? '' : 's'} still to go` : ''}.`
    : s.projected > s.limit && s.dayOfMonth >= 5 ? `At this pace you’ll spend about ${formatTaka(s.projected)} by month end — ${formatTaka(s.projected - s.limit)} over. To stay within budget, keep to ${perDay}.`
    : s.status === 'warning' ? `You’ve used ${Math.round(s.usedPct)}% of your budget. That leaves ${perDay}.`
    : `You’re on track — ${formatTaka(s.remaining)} left, about ${perDay}.`;
  return <div className={`panel budget-hero p-6 ${STATUS_CLASS[s.status]}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">SPENT IN {monthLabel(s.month).toUpperCase()}</p>
        <p className="mt-2"><span className="text-3xl font-semibold">{formatTaka(s.spent)}</span><span className="text-sm text-muted-foreground"> of {formatTaka(s.limit)}</span></p>
      </div>
      <Button variant="secondary" size="sm" onClick={onEdit}><Pencil size={14} />Budget</Button>
    </div>
    <div className="budget-track mt-5" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.usedPct)}>
      <div className="budget-fill" style={{ width: `${Math.min(100, s.usedPct)}%` }} />
      {s.isCurrent && <span className="budget-marker" style={{ left: `${expectedPct}%` }} title="Where you’d be spending evenly" />}
    </div>
    <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
      <span>{Math.round(s.usedPct)}% used</span>
      {s.isCurrent && <span>Even pace by today: {formatTaka((s.limit * s.dayOfMonth) / s.days)}</span>}
    </div>
    <p className="budget-message text-sm mt-4">{message}</p>
  </div>;
}

function QuickStats({ s, lastMonth }: { s: BudgetSummary; lastMonth: number }) {
  const diff = s.spent - lastMonth;
  const cards = [
    s.limit > 0
      ? { label: 'Safe to spend today', value: formatTaka(Math.max(0, s.safeToday)), note: s.safeToday < 0 ? `${formatTaka(-s.safeToday)} over today’s share` : `of ${formatTaka(s.dailyAllowance)} for today`, tone: s.safeToday < 0 ? 'text-destructive' : '' }
      : { label: 'Safe to spend today', value: '—', note: 'Set a budget first', tone: '' },
    { label: 'Spent today', value: formatTaka(s.todaySpent), note: s.todaySpent ? 'Logged so far' : 'Nothing yet', tone: '' },
    { label: 'Daily average', value: formatTaka(s.averagePerDay), note: s.limit > 0 ? `Aim for ${formatTaka(s.evenDaily)} or less` : 'This month so far', tone: s.limit > 0 && s.averagePerDay > s.evenDaily ? 'text-destructive' : '' },
    { label: 'vs last month', value: lastMonth || s.spent ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatTaka(Math.abs(diff))}` : '—', note: `Last month by now: ${formatTaka(lastMonth)}`, tone: diff > 0 ? 'text-destructive' : '' },
  ];
  return <div className="overview-grid">{cards.map(c => <div key={c.label} className="panel p-4 min-w-0">
    <p className="text-xs text-muted-foreground">{c.label}</p>
    <p className={`text-xl font-semibold mt-2 ${c.tone}`}>{c.value}</p>
    <p className="text-[11px] text-muted-foreground mt-1 truncate">{c.note}</p>
  </div>)}</div>;
}

function DailyChart({ s, series, today }: { s: BudgetSummary; series: { date: string; amount: number }[]; today: string }) {
  const max = Math.max(1, s.evenDaily * 1.5, ...series.map(d => d.amount));
  const overDays = series.filter(d => s.evenDaily > 0 && d.amount > s.evenDaily).length;
  return <section className="panel p-5">
    <div className="flex items-baseline justify-between gap-3 mb-1"><h2 className="section-title">Day by day</h2>{s.evenDaily > 0 && <span className="text-[11px] text-muted-foreground">Line = {formatTaka(s.evenDaily)}/day</span>}</div>
    <p className="text-xs text-muted-foreground mb-5">{s.evenDaily > 0 ? (overDays ? `${overDays} day${overDays === 1 ? '' : 's'} above your daily share.` : 'Every day within your daily share so far.') : 'How much you spent each day.'}</p>
    <div className="spend-chart" role="img" aria-label={`Daily spending for ${monthLabel(s.month)}`}>
      {s.evenDaily > 0 && <span className="spend-line" style={{ bottom: `${(s.evenDaily / max) * 100}%` }} />}
      {series.map(d => <span key={d.date} title={`${parseISODate(d.date).toLocaleDateString([], { day: 'numeric', month: 'short' })}: ${formatTaka(d.amount)}`}
        className={`spend-bar ${d.amount === 0 ? 'empty' : s.evenDaily > 0 && d.amount > s.evenDaily ? 'over' : ''} ${d.date > today ? 'future' : ''} ${d.date === today ? 'today' : ''}`}
        style={{ height: `${Math.max(2, (d.amount / max) * 100)}%` }} />)}
    </div>
    <div className="flex justify-between text-[10px] text-muted-foreground mt-2"><span>1</span><span>{Math.ceil(series.length / 2)}</span><span>{series.length}</span></div>
  </section>;
}

function CategoryPanel({ categories, total, onEdit }: { categories: ReturnType<typeof categoryBreakdown>; total: number; onEdit: () => void }) {
  return <section className="panel p-5">
    <div className="flex items-baseline justify-between gap-3 mb-4"><h2 className="section-title">Where it went</h2><button className="text-xs text-muted-foreground hover:text-foreground" onClick={onEdit}>Set limits</button></div>
    <div className="space-y-4">
      {categories.map(c => {
        const Icon = CATEGORY_ICON[c.category] ?? Wallet;
        const pct = c.limit > 0 ? (c.spent / c.limit) * 100 : total ? (c.spent / total) * 100 : 0;
        return <div key={c.category}>
          <div className="flex items-center gap-2 text-sm"><Icon size={15} className="text-muted-foreground" /><span className="flex-1">{c.category}</span>
            <span className={c.over ? 'text-destructive font-medium' : ''}>{formatTaka(c.spent)}</span>{c.limit > 0 && <span className="text-xs text-muted-foreground">/ {formatTaka(c.limit)}</span>}</div>
          <div className={`budget-track thin mt-2 ${c.over ? 'over' : c.near ? 'warning' : ''}`}><div className="budget-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div>
          {c.over && <p className="text-[11px] text-destructive mt-1">{formatTaka(c.spent - c.limit)} over this limit</p>}
        </div>;
      })}
      {categories.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nothing spent yet.</p>}
    </div>
  </section>;
}

export function ExpenseDialog({ expense, onClose }: { expense?: Expense | undefined; onClose: () => void }) {
  const { expenses, setExpenses, userId, prefs } = usePlanner();
  const today = toISODate(new Date());
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category ?? 'Food');
  const [date, setDate] = useState(expense?.date ?? today);
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = Math.round(Number(amount) * 100) / 100;
    if (!(value > 0)) { setError('Enter an amount above zero.'); return; }
    if (date > today) { setError('You can’t log spending for a future date.'); return; }
    const record: Expense = { id: expense?.id ?? crypto.randomUUID(), userId: expense?.userId ?? userId ?? '', title: title.trim(), amount: value, category, date };
    const others = expenses.filter(x => x.id !== record.id);
    setExpenses([...others, record]);
    for (const w of limitWarnings(others, record, prefs.budget)) toast.warning(w);
    onClose();
  }

  return <Modal title={expense ? 'Edit expense' : 'New expense'} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">Amount (৳)<input autoFocus className="field mt-2 text-lg" type="number" inputMode="decimal" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label className="block text-sm">What was it for?<input required maxLength={80} className="field mt-2" placeholder="e.g. Lunch, rickshaw, notebook" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Category<select className="field mt-2" value={category} onChange={e => setCategory(e.target.value)}>{[...new Set([...EXPENSE_CATEGORIES, category])].map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="block text-sm">Date<input type="date" required max={today} className="field mt-2" value={date} onChange={e => setDate(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit">{expense ? 'Save changes' : <><Plus /> Add expense</>}</Button>
    </form>
  </Modal>;
}

function BudgetDialog({ onClose }: { onClose: () => void }) {
  const { prefs, updatePrefs, expenses } = usePlanner();
  const lastMonth = shiftMonth(monthOf(toISODate(new Date())), -1);
  const lastMonthTotal = expenses.filter(e => monthOf(e.date) === lastMonth).reduce((a, e) => a + e.amount, 0);
  const [monthly, setMonthly] = useState(prefs.budget.monthly ? String(prefs.budget.monthly) : '');
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(prefs.budget.categoryLimits).map(([k, v]) => [k, String(v)])));
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const total = Math.max(0, Number(monthly) || 0);
    const categoryLimits: Record<string, number> = {};
    for (const [k, v] of Object.entries(limits)) if (Number(v) > 0) categoryLimits[k] = Number(v);
    const allocated = Object.values(categoryLimits).reduce((a, v) => a + v, 0);
    if (total > 0 && allocated > total) { setError(`Category limits add up to ${formatTaka(allocated)}, more than your ${formatTaka(total)} budget.`); return; }
    updatePrefs(p => ({ ...p, budget: { monthly: total, categoryLimits } }));
    onClose();
  }

  return <Modal title="Your budget" onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm">Monthly budget (৳)
        <input autoFocus className="field mt-2 text-lg" type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 15000" value={monthly} onChange={e => setMonthly(e.target.value)} />
        <span className="block text-xs text-muted-foreground mt-2">{lastMonthTotal ? `Last month you spent ${formatTaka(lastMonthTotal)}.` : 'The most you want to spend in a month.'}{Number(monthly) > 0 && ` That’s about ${formatTaka(Number(monthly) / 30)} a day.`}</span>
      </label>
      <div>
        <p className="text-sm">Category limits <span className="text-muted-foreground">(optional)</span></p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">Get a heads-up when one category is eating your budget. Leave blank for no limit.</p>
        <div className="grid grid-cols-2 gap-3">
          {EXPENSE_CATEGORIES.map(c => <label key={c} className="block text-xs text-muted-foreground">{c}
            <input className="field mt-1 py-1.5" type="number" inputMode="numeric" min="0" step="1" value={limits[c] ?? ''} onChange={e => setLimits(l => ({ ...l, [c]: e.target.value }))} /></label>)}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit">Save budget</Button>
    </form>
  </Modal>;
}
