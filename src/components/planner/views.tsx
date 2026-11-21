import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Moon, Sun, Check, X, BellRing, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_CATEGORIES } from '@/lib/daywell/tasks';
import type { ReminderSettings } from '@/lib/daywell/types';
import { DashboardSettings } from './dashboard';
import { usePlanner } from './state';
import { PageHeading } from './shell';
import { notificationPermission, requestNotificationPermission, type PermissionState } from './notifications';

export function SettingsView() {
  const { dark, setDark, prefs, updatePrefs } = usePlanner();
  const [newCat, setNewCat] = useState('');
  const [permission, setPermission] = useState<PermissionState>('default');
  useEffect(() => setPermission(notificationPermission()), []);
  const r = prefs.reminders;
  const setR = (patch: Partial<ReminderSettings>) => updatePrefs(p => ({ ...p, reminders: { ...p.reminders, ...patch } }));
  async function enableBrowser(on: boolean) {
    if (!on) { setR({ browser: false }); return; }
    const result = await requestNotificationPermission();
    setPermission(result);
    setR({ browser: result === 'granted' });
  }
  function addCategory(e: FormEvent) {
    e.preventDefault();
    const c = newCat.trim().slice(0, 30);
    if (c && !prefs.categories.includes(c)) updatePrefs(p => ({ ...p, categories: [...p.categories, c] }));
    setNewCat('');
  }

  return <>
    <PageHeading title="Make yourself at home." subtitle="The little preferences that make A’mal yours." />
    <div className="grid lg:grid-cols-2 gap-6 max-w-5xl items-start">
      <div className="panel p-6 space-y-7">
        <ProfileEditor />
        <div><h2 className="section-title mb-3">Appearance</h2><div className="flex gap-3"><Button variant={dark ? 'default' : 'outline'} onClick={() => setDark(true)}><Moon />Dark</Button><Button variant={!dark ? 'default' : 'outline'} onClick={() => setDark(false)}><Sun />Cream</Button></div></div>
        <label className="block text-sm">Lifestyle profile<select className="field mt-2" value={prefs.lifestyle} onChange={e => updatePrefs(p => ({ ...p, lifestyle: e.target.value }))}>{['Student', 'Employee', 'Business owner', 'Homemaker'].map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="block text-sm">Monthly budget (৳)<input type="number" min={0} inputMode="numeric" placeholder="Not set" className="field mt-2" value={prefs.budget.monthly || ''} onChange={e => updatePrefs(p => ({ ...p, budget: { ...p.budget, monthly: Math.max(0, Number(e.target.value) || 0) } }))} />
          <span className="block text-xs text-muted-foreground mt-2">Category limits and your spending pace live on the Expenses page.</span></label>
        <div>
          <h2 className="section-title mb-3">Task categories</h2>
          <div className="flex flex-wrap gap-2 mb-3">{prefs.categories.map(c => <span key={c} className="chip">{c}{!DEFAULT_CATEGORIES.includes(c) && <button aria-label={`Remove ${c}`} onClick={() => updatePrefs(p => ({ ...p, categories: p.categories.filter(x => x !== c) }))}><X size={12} /></button>}</span>)}</div>
          <form onSubmit={addCategory} className="flex gap-2"><input aria-label="New category" placeholder="New category" maxLength={30} className="field" value={newCat} onChange={e => setNewCat(e.target.value)} /><Button type="submit" variant="secondary" disabled={!newCat.trim()}><Plus />Add</Button></form>
        </div>
      </div>
      <div className="panel p-6 space-y-5">
        <h2 className="section-title">Reminders &amp; notifications</h2>
        <Toggle label="Reminders" description="Master switch for all reminders" checked={r.enabled} onChange={v => setR({ enabled: v })} />
        <div className={`space-y-5 ${r.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <Toggle label="Task reminders" checked={r.tasks} onChange={v => setR({ tasks: v })} />
          <label className="flex items-center justify-between gap-3 text-sm">Default for new tasks<select className="field w-auto py-1.5" value={r.defaultTaskMinutes} onChange={e => setR({ defaultTaskMinutes: Number(e.target.value) })}>{[0, 5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m ? `${m} min before` : 'At start time'}</option>)}</select></label>
          <Toggle label="Class reminders" checked={r.classes} onChange={v => setR({ classes: v })} />
          <label className="flex items-center justify-between gap-3 text-sm">Remind me before class<select className="field w-auto py-1.5" value={r.classMinutes} onChange={e => setR({ classMinutes: Number(e.target.value) })}>{[0, 5, 10, 15, 30].map(m => <option key={m} value={m}>{m ? `${m} min before` : 'At start time'}</option>)}</select></label>
          <Toggle label="Namaz reminders" description="Choose prayers and timing on the Namaz page" checked={r.prayers} onChange={v => setR({ prayers: v })} />
          <div className="border-t border-border pt-5">
            <Toggle label="Browser notifications" description="Show system notifications while A’mal is open in a tab" checked={r.browser && permission === 'granted'} onChange={enableBrowser} disabled={permission === 'unsupported'} />
            {permission === 'denied' && <p className="text-xs text-destructive mt-2">Notifications are blocked for this site. Allow them in your browser’s site settings — in-app reminders still work.</p>}
            {permission === 'unsupported' && <p className="text-xs text-muted-foreground mt-2">This browser doesn’t support notifications. In-app reminders still work.</p>}
            {r.browser && permission === 'granted' && <Button variant="secondary" size="sm" className="mt-3" onClick={async () => { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.showNotification('A’mal', { body: 'Notifications are working.', tag: 'daywell-test' }); else new Notification('A’mal', { body: 'Notifications are working.' }); }}><BellRing size={14} />Send a test</Button>}
            <p className="text-[11px] text-muted-foreground mt-3">Reminders you miss while A’mal is closed appear in the bell when you come back.</p>
          </div>
        </div>
      </div>
      <div className="panel p-6"><DashboardSettings /></div>
    </div>
  </>;
}

function ProfileEditor() {
  const { profile, setName, signOut, updateEmail, updatePassword } = usePlanner();
  const [name, setNameDraft] = useState(profile?.name ?? '');
  const [savedName, setSavedName] = useState(false);
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailStatus, setEmailStatus] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setName(name.trim().slice(0, 60));
    setSavedName(true);
    window.setTimeout(() => setSavedName(false), 2000);
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setEmailStatus(null);
    setEmailBusy(true);
    const result = await updateEmail(email, emailPassword);
    setEmailBusy(false);
    if (result.error) setEmailStatus({ kind: 'error', text: result.error });
    else if (result.notice) {
      setEmailStatus({ kind: 'notice', text: result.notice });
      setEmail('');
      setEmailPassword('');
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);
    if (nextPassword !== confirmPassword) {
      setPasswordStatus({ kind: 'error', text: 'Type the new password the same way in both fields.' });
      return;
    }
    setPasswordBusy(true);
    const result = await updatePassword(currentPassword, nextPassword);
    setPasswordBusy(false);
    if (result.error) setPasswordStatus({ kind: 'error', text: result.error });
    else if (result.notice) {
      setPasswordStatus({ kind: 'notice', text: result.notice });
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
    }
  }

  return <div className="space-y-7">
    <form onSubmit={saveName}>
      <h2 className="section-title mb-3">Your name</h2>
      <div className="flex gap-2"><input aria-label="Display name" required maxLength={60} autoComplete="name" className="field" value={name} onChange={e => setNameDraft(e.target.value)} /><Button type="submit" disabled={!name.trim() || name.trim() === profile?.name}>{savedName ? <><Check />Saved</> : 'Save'}</Button></div>
      <p className="text-xs text-muted-foreground mt-2">Shown in your greeting and saved on this account.</p>
    </form>
    <form onSubmit={saveEmail} className="space-y-3 border-t border-border pt-7">
      <h2 className="section-title">Email</h2>
      <p className="text-xs text-muted-foreground">You sign in with {profile?.email}. Your records stay on this account when the address changes.</p>
      <label className="block text-sm">New email<input required type="email" autoComplete="email" className="field mt-2" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block text-sm">Current password<input required type="password" autoComplete="current-password" className="field mt-2" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} /></label>
      {emailStatus && <p role={emailStatus.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${emailStatus.kind === 'error' ? 'text-destructive' : ''}`}>{emailStatus.text}</p>}
      <Button type="submit" disabled={emailBusy || !email.trim() || emailPassword.length < 6}>{emailBusy ? 'Saving…' : 'Change email'}</Button>
    </form>
    <form onSubmit={savePassword} className="space-y-3 border-t border-border pt-7">
      <h2 className="section-title">Password</h2>
      <label className="block text-sm">Current password<input required type="password" autoComplete="current-password" className="field mt-2" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
      <label className="block text-sm">New password<input required type="password" minLength={6} autoComplete="new-password" className="field mt-2" value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></label>
      <label className="block text-sm">Repeat new password<input required type="password" minLength={6} autoComplete="new-password" className="field mt-2" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
      {passwordStatus && <p role={passwordStatus.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${passwordStatus.kind === 'error' ? 'text-destructive' : ''}`}>{passwordStatus.text}</p>}
      <Button type="submit" disabled={passwordBusy || currentPassword.length < 1 || nextPassword.length < 6 || confirmPassword.length < 6}>{passwordBusy ? 'Saving…' : 'Change password'}</Button>
    </form>
    <Button type="button" variant="secondary" onClick={() => void signOut()}><LogOut />Sign out</Button>
  </div>;
}

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="flex justify-between items-center gap-4">
    <div><p className="text-sm">{label}</p>{description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}</div>
    <Button variant={checked ? 'default' : 'secondary'} size="sm" disabled={disabled} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}>{checked ? 'On' : 'Off'}</Button>
  </div>;
}
