import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_NAME } from './brand';
import { usePlanner } from './state';

export function AuthScreen() {
  const { signIn, signUp } = usePlanner();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const message = mode === 'up' ? await signUp(name.trim(), email.trim(), password) : await signIn(email.trim(), password);
    setBusy(false);
    if (message?.startsWith('Confirm')) setNotice(message);
    else if (message) setError(message);
  }

  return <main className="min-h-screen grid place-items-center px-5">
    <form onSubmit={submit} className="onboarding w-full max-w-md">
      <p className="brand mb-8">{APP_NAME}<span className="text-primary">.</span></p>
      <h1 className="page-title">{mode === 'up' ? 'Create your account' : `Welcome back`}<span className="text-primary">.</span></h1>
      <p className="text-muted-foreground text-sm mt-3 mb-8">{mode === 'up' ? `Your tasks, classes, notes and spending stay private to this email.` : `Sign in to open the record saved for your email.`}</p>
      {mode === 'up' && <label className="block text-sm mb-4">Your name<input autoFocus required maxLength={60} autoComplete="name" className="field mt-2" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ayesha" /></label>}
      <label className="block text-sm">Email<input required type="email" autoComplete="email" className="field mt-2" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block text-sm mt-4">Password<input required type="password" minLength={6} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} className="field mt-2" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-destructive mt-4">{error}</p>}
      {notice && <p role="status" className="text-sm mt-4">{notice}</p>}
      <Button type="submit" className="w-full mt-5" disabled={busy || !email.trim() || password.length < 6 || (mode === 'up' && !name.trim())}>{busy ? 'Please wait…' : mode === 'up' ? 'Create account' : 'Sign in'} <ArrowRight /></Button>
      <button type="button" className="text-sm text-muted-foreground mt-4 hover:text-foreground" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(''); setNotice(''); }}>
        {mode === 'up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </form>
  </main>;
}

export function SetupScreen() {
  return <main className="min-h-screen grid place-items-center px-5">
    <div className="onboarding w-full max-w-md">
      <p className="brand mb-8">{APP_NAME}<span className="text-primary">.</span></p>
      <h1 className="page-title">{APP_NAME} isn’t connected yet<span className="text-primary">.</span></h1>
      <ol className="text-sm text-muted-foreground mt-4 space-y-2 list-decimal pl-5">
        <li>In the Supabase project, open the SQL editor and run <span className="text-foreground">db/schema.sql</span>.</li>
        <li>Turn on email sign-in. For a personal account, you can turn off “Confirm email”.</li>
        <li>Copy the project URL and the anon key into <span className="text-foreground">.env.local</span>.</li>
        <li>Restart the app, then create an account. Each email only sees its own records.</li>
      </ol>
    </div>
  </main>;
}
