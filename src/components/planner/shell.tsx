import { Link, useRouterState } from '@tanstack/react-router';
import { Sun, Moon, LayoutGrid, ListTodo, NotebookPen, Wallet, GraduationCap, Settings, X, MapPin } from 'lucide-react';
import { APP_NAME } from './brand';
import { NamazIcon } from './namaz-icon';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { initials } from '@/lib/daywell/time';
import { AuthScreen, SetupScreen } from './auth';
import { usePlanner } from './state';
import { NotificationBell, ReminderEngine } from './notifications';

const nav = [
  { to: '/', label: 'Overview', short: 'Home', icon: LayoutGrid },
  { to: '/tasks', label: 'Tasks', short: 'Tasks', icon: ListTodo },
  { to: '/namaz', label: 'Namaz', short: 'Namaz', icon: NamazIcon },
  { to: '/classes', label: 'Class routine', short: 'Classes', icon: GraduationCap },
  { to: '/notes', label: 'Notes', short: 'Notes', icon: NotebookPen },
  { to: '/expenses', label: 'Expenses', short: 'Spend', icon: Wallet },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { dark, setDark, ready, configured, profile, prefs, storageError } = usePlanner();
  const path = useRouterState({ select: s => s.location.pathname });
  const name = profile?.name ?? '';

  if (!ready) return <div className="dark"><div className="planner" aria-busy="true" /></div>;
  if (!configured) return <div className={dark ? 'dark' : ''}><div className="planner"><SetupScreen /></div></div>;
  if (!profile) return <div className={dark ? 'dark' : ''}><div className="planner"><AuthScreen /></div></div>;

  return <div className={dark ? 'dark' : ''}><div className="planner">
    <ReminderEngine />
    <aside className="sidebar">
      <Link to="/" className="brand mb-10"><span className="brand-name">{APP_NAME}<span className="text-primary">.</span></span></Link>
      <div className="sidebar-extra text-[10px] uppercase text-muted-foreground mb-3 px-4">YOUR EVERYDAY SPACE</div>
      <nav>{nav.map(n => <Link key={n.to} to={n.to} className={`nav-link ${path === n.to ? 'active' : ''}`}><n.icon size={19} /><span className="nav-label">{n.label}</span></Link>)}</nav>
      <div className="sidebar-extra mt-auto">
        <div className="border-t border-border pt-5"><Link to="/settings" className={`nav-link ${path === '/settings' ? 'active' : ''}`}><Settings size={19} />Settings</Link></div>
        <Link to="/settings" className="flex items-center gap-3 mt-6 px-2"><div className="size-10 shrink-0 rounded-full bg-lilac text-ink grid place-items-center font-semibold text-sm">{initials(name)}</div><div className="min-w-0"><p className="text-sm font-medium truncate">{name}</p><p className="text-xs text-muted-foreground mt-1">A little better, every day</p></div></Link>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="flex items-center gap-2 text-sm min-w-0"><span className="text-muted-foreground hidden sm:inline">My workspace</span><span className="text-muted-foreground mx-1 hidden sm:inline">/</span><span className="truncate">{nav.find(n => n.to === path)?.label ?? 'Settings'}</span></div>
        <div className="flex gap-3 items-center">
          <Link to="/namaz" className="hidden lg:flex items-center gap-2 mr-6 text-xs text-muted-foreground hover:text-foreground"><MapPin size={13} /> {prefs.prayer.locationName}</Link>
          <Button variant="ghost" size="icon" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</Button>
          <NotificationBell />
          <Link to="/settings" aria-label="Your profile" className="size-9 rounded-full bg-lilac text-ink grid place-items-center text-xs font-semibold ml-1">{initials(name)}</Link>
        </div>
      </header>
      {storageError && <p role="alert" className="bg-coral text-ink text-sm px-6 py-2">{storageError}</p>}
      <main className="content">{children}</main>
    </div>
    <nav className="mobile-nav">{nav.map(n => <Link key={n.to} to={n.to} className={`nav-link ${path === n.to ? 'active' : ''}`}><n.icon size={19} /><span>{n.short}</span></Link>)}</nav>
    <Toaster position="bottom-right" />
  </div></div>;
}

export function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4 mb-8"><div><h1 className="page-title">{title}</h1><p className="text-muted-foreground text-sm mt-2.5">{subtitle}</p></div>{action}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-semibold">{title}</h2><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button></div>
      {children}
    </section>
  </div>;
}
