import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, BellOff, Check, GraduationCap, ListTodo, X } from 'lucide-react';
import { NamazIcon } from './namaz-icon';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { buildReminders } from '@/lib/daywell/reminders';
import { load } from '@/lib/daywell/storage';
import { formatClock, formatRelative } from '@/lib/daywell/time';
import type { InboxItem, ReminderInstance, ReminderKind } from '@/lib/daywell/types';
import { useNow, usePlanner } from './state';

const MISSED_AFTER = 2 * 60_000;
const MAX_CATCH_UP = 24 * 3_600_000;
const KIND_ICON: Record<ReminderKind, typeof Bell> = { task: ListTodo, class: GraduationCap, prayer: NamazIcon };
const KIND_LINK: Record<ReminderKind, '/tasks' | '/classes' | '/namaz'> = { task: '/tasks', class: '/classes', prayer: '/namaz' };

export type PermissionState = NotificationPermission | 'unsupported';

export function notificationPermission(): PermissionState {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

async function showBrowserNotification(r: ReminderInstance) {
  if (notificationPermission() !== 'granted') return;
  const options: NotificationOptions = { body: r.body, tag: r.id, data: { url: KIND_LINK[r.kind] } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(r.title, options);
    else new Notification(r.title, options);
  } catch {
    // The in-app inbox already holds this reminder, so a failed OS notification loses nothing.
  }
}

/** Runs while the app is open: delivers due reminders once and records what was missed while closed. */
export function ReminderEngine() {
  const { tasks, sessions, prefs, userId, ready, setInbox, reminderMeta, setReminderMeta } = usePlanner();
  const now = useNow(15_000);
  const metaRef = useRef(reminderMeta);
  metaRef.current = reminderMeta;

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    // Merge with what other open tabs have already delivered to avoid duplicates.
    const stored = load(userId, 'reminder_meta', metaRef.current);
    const fired = { ...stored.firedIds, ...metaRef.current.firedIds };
    const lastTick = Math.max(stored.lastTick, metaRef.current.lastTick) || now;
    const from = Math.max(lastTick, now - MAX_CATCH_UP);
    const due = buildReminders({ tasks, sessions, prefs }, now, from, now).filter(r => !fired[r.id]);

    if (due.length) {
      const items: InboxItem[] = due.map(r => ({ ...r, missed: now - r.fireAt > MISSED_AFTER, read: false, deliveredAt: now }));
      setInbox(prev => [...items.reverse(), ...prev.filter(p => !items.some(i => i.id === p.id))].slice(0, 60));
      for (const item of items) {
        fired[item.id] = item.fireAt;
        if (item.missed) continue;
        toast(item.title, { description: item.body });
        if (prefs.reminders.browser) void showBrowserNotification(item);
      }
      const missed = items.filter(i => i.missed).length;
      if (missed) toast(`You missed ${missed} reminder${missed > 1 ? 's' : ''} while away`, { description: 'Open the bell to catch up.' });
    }
    const cutoff = now - 3 * 86_400_000;
    for (const [id, at] of Object.entries(fired)) if (at < cutoff) delete fired[id];
    setReminderMeta({ lastTick: now, firedIds: fired });
  }, [now, ready, userId, tasks, sessions, prefs, setInbox, setReminderMeta]);

  return null;
}

export function NotificationBell() {
  const { inbox, setInbox, tasks, sessions, prefs, setOccurrenceStatus, togglePrayer, prayerLog } = usePlanner();
  const [open, setOpen] = useState(false);
  const now = useNow(30_000);
  const panel = useRef<HTMLDivElement>(null);
  const unread = inbox.filter(i => !i.read).length;
  const upcoming = useMemo(() => buildReminders({ tasks, sessions, prefs }, now, now, now + 86_400_000).slice(0, 5), [tasks, sessions, prefs, now]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  function toggle() {
    setOpen(o => !o);
    if (!open && unread) setInbox(p => p.map(i => ({ ...i, read: true })));
  }
  const dismiss = (id: string) => setInbox(p => p.filter(i => i.id !== id));
  function complete(item: InboxItem) {
    if (item.kind === 'task') setOccurrenceStatus(item.sourceId, item.date, 'completed');
    if (item.kind === 'prayer' && !(prayerLog[item.date] ?? []).includes(item.sourceId)) togglePrayer(item.sourceId, item.date);
    dismiss(item.id);
  }

  return (
    <div className="relative" ref={panel}>
      <Button variant="ghost" size="icon" title="Reminders" aria-label={`Open reminders${unread ? `, ${unread} new` : ''}`} aria-expanded={open} onClick={toggle}>
        {prefs.reminders.enabled ? <Bell /> : <BellOff />}
        {unread > 0 && <span className="absolute right-1 top-1 min-w-4 h-4 px-1 rounded-full bg-coral text-ink text-[9px] font-semibold grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </Button>
      {open && (
        <div className="panel notification-panel absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] p-5 z-40 max-h-[70vh] overflow-auto shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Your reminders</h3>
            {inbox.length > 0 && <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setInbox([])}>Clear all</button>}
          </div>
          {!prefs.reminders.enabled && <p className="text-xs text-muted-foreground mb-3">Reminders are turned off. <Link to="/settings" className="underline" onClick={() => setOpen(false)}>Turn them on</Link></p>}
          {inbox.length === 0 && <p className="text-sm text-muted-foreground py-2">You’re all caught up.</p>}
          {inbox.map(item => {
            const Icon = KIND_ICON[item.kind];
            const canComplete = item.kind === 'task' || item.kind === 'prayer';
            return (
              <div key={item.id} className="flex gap-3 py-3 border-b border-border last:border-0">
                <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title} {item.missed && <span className="tag bg-coral text-ink ml-1">Missed</span>}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatRelative(item.fireAt - now)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  {canComplete && <Button variant="ghost" size="icon" className="size-7" aria-label={`Mark ${item.title} done`} title="Mark done" onClick={() => complete(item)}><Check size={14} /></Button>}
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Dismiss ${item.title}`} title="Dismiss" onClick={() => dismiss(item.id)}><X size={14} /></Button>
                </div>
              </div>
            );
          })}
          <UpcomingList items={upcoming} now={now} />
        </div>
      )}
    </div>
  );
}

export function UpcomingList({ items, now }: { items: ReminderInstance[]; now: number }) {
  const { prefs } = usePlanner();
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Next 24 hours</p>
      {items.length === 0 && <p className="text-xs text-muted-foreground">No reminders scheduled.</p>}
      {items.map(r => {
        const Icon = KIND_ICON[r.kind];
        return (
          <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <Icon size={14} className="text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{r.title}</span>
            <span className="text-xs text-muted-foreground" title={formatRelative(r.fireAt - now)}>{formatClock(new Date(r.fireAt), r.kind === 'prayer' ? prefs.prayer.timeZone : undefined)}</span>
          </div>
        );
      })}
    </div>
  );
}
