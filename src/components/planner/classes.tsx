import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { AlertTriangle, Check, Clock3, FileText, GraduationCap, Loader2, MapPin, Pencil, Play, Plus, Sparkles, Square, Trash2, Upload, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { classLabel, classState, classesOn } from '@/lib/daywell/classes';
import { ACCEPT_ATTR, clean, extractFromFile, fileKind, validateFile, type ExtractedClass } from '@/lib/daywell/routine-parser';
import { DAY_NAMES, formatDuration, formatRange, formatTime, toISODate, uid } from '@/lib/daywell/time';
import type { ClassSession } from '@/lib/daywell/types';
import { extractRoutineWithAI } from '@/lib/routine-extract.functions';
import { Modal, PageHeading } from './shell';
import { useNow, usePlanner } from './state';

const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const EMPTY_ROW: ExtractedClass = { courseName: '', courseCode: '', day: 0, start: '09:00', end: '10:30', room: '', faculty: '', section: '' };

export function ClassTimerCard({ compact }: { compact?: boolean }) {
  const { sessions, classOverrides, startClass, endClass } = usePlanner();
  const now = useNow(1000);
  const state = classState(sessions, classOverrides, now);
  if (state.kind === 'idle') {
    return <div className="panel p-5 text-sm text-muted-foreground flex items-center gap-3"><GraduationCap size={20} />No classes scheduled. Upload your class routine to start the countdown.</div>;
  }
  const s = state.occ.session;
  const isToday = state.occ.date === toISODate(new Date(now));
  return <div className={`rounded-lg p-5 ${state.kind === 'active' ? 'bg-lime' : 'bg-lilac'} text-ink`} aria-live="polite">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-semibold tracking-wide">{state.kind === 'active' ? 'IN CLASS NOW' : isToday ? 'NEXT CLASS' : `NEXT CLASS · ${(DAY_NAMES[s.day] ?? '').toUpperCase()}`}</span>
      {state.kind === 'active' && state.manual && <span className="tag bg-ink/10">Started manually</span>}
    </div>
    <h3 className={`font-semibold mt-2 ${compact ? 'text-lg' : 'text-2xl'}`}>{classLabel(s)}</h3>
    <p className="text-xs opacity-75 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      <span className="flex items-center gap-1"><Clock3 size={12} />{formatRange(s.start, s.end)}</span>
      {s.room && <span className="flex items-center gap-1"><MapPin size={12} />{s.room}</span>}
      {s.faculty && <span className="flex items-center gap-1"><User size={12} />{s.faculty}</span>}
      {s.section && <span>Section {s.section}</span>}
    </p>
    <div className="flex flex-wrap items-end justify-between gap-3 mt-4">
      <div>
        <p className="text-[10px] opacity-70">{state.kind === 'active' ? 'Elapsed' : 'Starts in'}</p>
        <p className={`${compact ? 'text-2xl' : 'text-4xl'} font-semibold tabular-nums`}>{formatDuration(state.kind === 'active' ? state.elapsed : state.startsIn)}</p>
        {state.kind === 'active' && <p className="text-[11px] opacity-70 mt-1">{formatDuration(state.remaining)} left · ends {formatTime(s.end)}</p>}
      </div>
      {state.kind === 'active'
        ? <Button variant="outline" className="bg-transparent border-ink/30 text-ink hover:bg-ink/10" onClick={() => endClass(state.occ.key)}><Square size={14} />End class</Button>
        : isToday && <Button variant="outline" className="bg-transparent border-ink/30 text-ink hover:bg-ink/10" onClick={() => startClass(state.occ.key)}><Play size={14} />Start now</Button>}
    </div>
  </div>;
}

export function TodaysClasses() {
  const { sessions, classOverrides } = usePlanner();
  const now = useNow(30_000);
  const today = classesOn(sessions, toISODate(new Date(now)));
  if (!today.length) return <p className="text-sm text-muted-foreground py-4">No classes today.</p>;
  return <div>{today.map(o => {
    const ended = !!classOverrides[o.key]?.endedAt || now > o.scheduledEnd;
    return <div key={o.key} className={`task-row ${ended ? 'opacity-55' : ''}`}>
      <div className="size-10 bg-lilac text-ink rounded-lg grid place-items-center shrink-0"><GraduationCap size={18} /></div>
      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{classLabel(o.session)}</p><p className="text-xs text-muted-foreground mt-1">{formatRange(o.session.start, o.session.end)}{o.session.room && ` · ${o.session.room}`}</p></div>
      {o.session.faculty && <span className="tag hidden sm:inline">{o.session.faculty}</span>}
    </div>;
  })}</div>;
}

export function ClassesPage() {
  const { sessions } = usePlanner();
  const [adding, setAdding] = useState(false);
  return <>
    <PageHeading title="A week with intention." subtitle="Upload your class routine — A’mal reads it, you confirm it, and the countdown takes care of the rest." action={<Button onClick={() => setAdding(true)}><Plus />Add class</Button>} />
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 max-w-6xl mb-6">
      <ClassTimerCard />
      <RoutineUpload />
    </div>
    <WeeklyRoutine />
    {sessions.length === 0 && <p className="text-sm text-muted-foreground mt-4">Tip: you can also add classes one by one with “Add class”.</p>}
    {adding && <ClassDialog onClose={() => setAdding(false)} />}
  </>;
}

function RoutineUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'ai'>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ExtractedClass[] | null>(null);
  const [method, setMethod] = useState('');
  const [rawText, setRawText] = useState('');
  const [dragOver, setDragOver] = useState(false);

  async function process(f: File) {
    const problem = validateFile(f);
    setFile(f); setRows(null); setError(problem ?? ''); setProgress(0);
    if (problem) return;
    setBusy('reading');
    try {
      const result = await extractFromFile(f, setProgress);
      setRows(result.rows);
      setMethod(result.method);
      setRawText(result.rawText);
      if (!result.rows.length) setError('We couldn’t find classes in this file automatically. Try “Read with AI”, or add the rows yourself below.');
    } catch {
      setError('We couldn’t read this file. Make sure it isn’t password-protected or corrupted.');
      setRows([]);
    } finally { setBusy(''); }
  }

  async function readWithAI() {
    if (!file) return;
    setBusy('ai'); setError('');
    try {
      const isImage = fileKind(file) === 'image';
      const data = isImage ? await toBase64(file) : rawText;
      if (!data.trim()) throw new Error('No readable text was found in this file.');
      const res = await extractRoutineWithAI({ data: { fileName: file.name.slice(0, 200), mimeType: isImage ? (file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png') : 'text/plain', data } });
      if (!res.ok) { setError(res.error); return; }
      setRows(res.classes.map(c => ({ ...c, courseName: clean(c.courseName, 80), courseCode: clean(c.courseCode, 20), room: clean(c.room, 30), faculty: clean(c.faculty, 60), section: clean(c.section, 10) })));
      setMethod('AI layout reading');
      if (!res.classes.length) setError('The AI didn’t find any classes either. You can add them manually.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(''); }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void process(f);
  }

  if (rows && file && !busy) {
    return <ReviewExtraction rows={rows} fileName={file.name} method={method} error={error} onAI={readWithAI}
      onDone={() => { setRows(null); setFile(null); setError(''); }} />;
  }

  return <div className="panel p-6">
    <div className="flex items-center gap-2 mb-1"><Upload size={18} className="text-primary" /><h2 className="section-title">Upload class routine</h2></div>
    <p className="text-sm text-muted-foreground mb-4">DOCX, DOC, XLSX, XLS or PNG, up to 10 MB. Files are read on your device; you’ll review everything before it’s saved.</p>
    <input ref={input} type="file" className="hidden" accept={ACCEPT_ATTR} onChange={e => { const f = e.target.files?.[0]; if (f) void process(f); e.target.value = ''; }} />
    <button type="button" disabled={!!busy} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
      className={`w-full border border-dashed rounded-lg p-7 flex flex-col items-center gap-2 text-sm text-muted-foreground transition-colors ${dragOver ? 'bg-secondary border-primary' : 'border-border hover:bg-secondary'}`}>
      {busy
        ? <><Loader2 size={22} className="animate-spin" /><span className="text-foreground font-medium">{busy === 'ai' ? 'Reading the layout with AI…' : fileKind(file!) === 'image' ? `Recognizing text… ${Math.round(progress * 100)}%` : 'Reading your routine…'}</span><span>{file?.name}</span></>
        : file ? <><FileText size={22} /><span className="text-foreground font-medium">{file.name}</span><span>Choose another file</span></>
          : <><Upload size={22} /><span>Drop a file here, or click to choose</span></>}
    </button>
    {error && <p className="text-sm text-destructive mt-4" role="alert">{error}</p>}
  </div>;
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.onload = () => { const v = String(r.result); res(v.slice(v.indexOf(',') + 1)); };
    r.readAsDataURL(file);
  });
}

function ReviewExtraction({ rows: initial, fileName, method, error, onAI, onDone }: { rows: ExtractedClass[]; fileName: string; method: string; error: string; onAI: () => void; onDone: () => void }) {
  const { sessions, setSessions, setRoutines, userId } = usePlanner();
  const [rows, setRows] = useState(initial.length ? initial : [{ ...EMPTY_ROW }]);
  const [name, setName] = useState(fileName.replace(/\.[^.]+$/, ''));
  const [mode, setMode] = useState<'replace' | 'merge'>(sessions.length ? 'replace' : 'merge');
  const [problem, setProblem] = useState('');
  const missingFaculty = rows.filter(r => !r.faculty.trim()).length;
  const patch = (i: number, p: Partial<ExtractedClass>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function save() {
    const bad = rows.findIndex(r => !(r.courseName.trim() || r.courseCode.trim()) || !r.start || !r.end || r.end <= r.start);
    if (bad >= 0) { setProblem(`Row ${bad + 1} needs a course name or code, and an end time after its start time.`); return; }
    const routineId = uid();
    const uidStr = userId ?? '';
    setRoutines(p => [...(mode === 'replace' ? [] : p), { id: routineId, userId: uidStr, name: clean(name, 80) || 'Class routine', sourceFile: fileName, createdAt: new Date().toISOString() }]);
    const created: ClassSession[] = rows.map(r => ({
      id: uid(), userId: uidStr, routineId,
      courseName: clean(r.courseName, 80), courseCode: clean(r.courseCode, 20), room: clean(r.room, 30), faculty: clean(r.faculty, 60), section: clean(r.section, 10),
      day: r.day, start: r.start, end: r.end,
    }));
    setSessions(p => [...(mode === 'replace' ? [] : p), ...created]);
    onDone();
  }

  return <div className="panel p-6 lg:col-span-2">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="section-title">Review your routine</h2>
        <p className="text-xs text-muted-foreground mt-1">Found {initial.length} class{initial.length === 1 ? '' : 'es'} in {fileName} · {method}. Fix anything that looks off — we only fill in what we could actually read.</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onAI}><Sparkles size={14} />Read with AI</Button>
    </div>
    {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
    {missingFaculty > 0 && <p className="text-xs mb-3 flex items-center gap-2 bg-yellow text-ink rounded-md px-3 py-2"><AlertTriangle size={14} />{missingFaculty} class{missingFaculty > 1 ? 'es are' : ' is'} missing a faculty name — add them below if you know them.</p>}
    <div className="review-table">
      <div className="review-head"><span>Course</span><span>Code</span><span>Day</span><span>Start</span><span>End</span><span>Room</span><span>Faculty</span><span>Sec.</span><span /></div>
      {rows.map((r, i) => <div key={i} className="review-row">
        <input aria-label={`Row ${i + 1} course name`} placeholder="Course name" className="field" value={r.courseName} onChange={e => patch(i, { courseName: e.target.value })} />
        <input aria-label={`Row ${i + 1} course code`} placeholder="Code" className="field" value={r.courseCode} onChange={e => patch(i, { courseCode: e.target.value })} />
        <select aria-label={`Row ${i + 1} day`} className="field" value={r.day} onChange={e => patch(i, { day: Number(e.target.value) })}>{DAY_NAMES.map((d, n) => <option key={d} value={n}>{d}</option>)}</select>
        <input aria-label={`Row ${i + 1} start time`} type="time" className="field" value={r.start} onChange={e => patch(i, { start: e.target.value })} />
        <input aria-label={`Row ${i + 1} end time`} type="time" className="field" value={r.end} onChange={e => patch(i, { end: e.target.value })} />
        <input aria-label={`Row ${i + 1} room`} placeholder="Room" className="field" value={r.room} onChange={e => patch(i, { room: e.target.value })} />
        <input aria-label={`Row ${i + 1} faculty`} placeholder="Add faculty" className={`field ${r.faculty.trim() ? '' : 'field-missing'}`} value={r.faculty} onChange={e => patch(i, { faculty: e.target.value })} />
        <input aria-label={`Row ${i + 1} section`} placeholder="—" className="field" value={r.section} onChange={e => patch(i, { section: e.target.value })} />
        <Button variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><Trash2 size={15} /></Button>
      </div>)}
    </div>
    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRows(rs => [...rs, { ...EMPTY_ROW, day: rs.at(-1)?.day ?? 0 }])}><Plus size={14} />Add a row</Button>
    <div className="flex flex-wrap items-end gap-4 mt-5 border-t border-border pt-5">
      <label className="block text-sm flex-1 min-w-48">Routine name<input className="field mt-2" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
      {sessions.length > 0 && <label className="block text-sm">When saving<select className="field mt-2" value={mode} onChange={e => setMode(e.target.value as 'replace' | 'merge')}><option value="replace">Replace my current routine</option><option value="merge">Add to my current routine</option></select></label>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={save} disabled={!rows.length}><Check />Save {rows.length} class{rows.length === 1 ? '' : 'es'}</Button>
      </div>
    </div>
    {problem && <p className="text-sm text-destructive mt-3" role="alert">{problem}</p>}
  </div>;
}

function WeeklyRoutine() {
  const { sessions, setSessions, routines } = usePlanner();
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const today = new Date().getDay();
  if (!sessions.length) return null;
  return <div className="panel p-6 max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 className="section-title">Your weekly routine</h2>
      <div className="flex items-center gap-3">
        {routines.length > 0 && <span className="text-xs text-muted-foreground">{routines.map(r => r.name).join(', ')}</span>}
        <Button variant="ghost" size="sm" onClick={() => { if (confirm('Remove your whole class routine?')) setSessions([]); }}><Trash2 size={14} />Clear</Button>
      </div>
    </div>
    <div className="week-grid">
      {WEEK_ORDER.filter(d => sessions.some(s => s.day === d)).map(d => <div key={d}>
        <h3 className={`text-xs uppercase mb-2 ${d === today ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{DAY_NAMES[d]}{d === today && ' · Today'}</h3>
        {sessions.filter(s => s.day === d).sort((a, b) => a.start.localeCompare(b.start)).map(s => <div key={s.id} className="task-row">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{classLabel(s)}{s.section && <span className="text-muted-foreground font-normal"> · Sec {s.section}</span>}</p>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><span>{formatRange(s.start, s.end)}</span>{s.room && <span className="flex items-center gap-1"><MapPin size={11} />{s.room}</span>}<span className="flex items-center gap-1"><User size={11} />{s.faculty || <em className="not-italic text-coral">Faculty not set</em>}</span></p>
          </div>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${classLabel(s)}`} onClick={() => setEditing(s)}><Pencil size={14} /></Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Delete ${classLabel(s)}`} onClick={() => setSessions(p => p.filter(x => x.id !== s.id))}><Trash2 size={14} /></Button>
        </div>)}
      </div>)}
    </div>
    {editing && <ClassDialog session={editing} onClose={() => setEditing(null)} />}
  </div>;
}

function ClassDialog({ session, onClose }: { session?: ClassSession; onClose: () => void }) {
  const { setSessions, userId } = usePlanner();
  const [v, setV] = useState<ExtractedClass>(session ?? { ...EMPTY_ROW, day: new Date().getDay() });
  const [error, setError] = useState('');
  const set = (p: Partial<ExtractedClass>) => setV(x => ({ ...x, ...p }));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!(v.courseName.trim() || v.courseCode.trim())) { setError('Add a course name or code.'); return; }
    if (v.end <= v.start) { setError('End time should be after the start time.'); return; }
    const data = { courseName: clean(v.courseName, 80), courseCode: clean(v.courseCode, 20), room: clean(v.room, 30), faculty: clean(v.faculty, 60), section: clean(v.section, 10), day: v.day, start: v.start, end: v.end };
    if (session) setSessions(p => p.map(s => (s.id === session.id ? { ...s, ...data } : s)));
    else setSessions(p => [...p, { ...data, id: uid(), userId: userId ?? '', routineId: null }]);
    onClose();
  }
  return <Modal title={session ? 'Edit class' : 'Add a class'} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <label className="block text-sm">Course name<input autoFocus className="field mt-2" value={v.courseName} onChange={e => set({ courseName: e.target.value })} /></label>
        <label className="block text-sm">Code<input className="field mt-2" value={v.courseCode} onChange={e => set({ courseCode: e.target.value })} /></label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">Day<select className="field mt-2" value={v.day} onChange={e => set({ day: Number(e.target.value) })}>{DAY_NAMES.map((d, n) => <option key={d} value={n}>{d}</option>)}</select></label>
        <label className="block text-sm">Start<input type="time" required className="field mt-2" value={v.start} onChange={e => set({ start: e.target.value })} /></label>
        <label className="block text-sm">End<input type="time" required className="field mt-2" value={v.end} onChange={e => set({ end: e.target.value })} /></label>
      </div>
      <div className="grid grid-cols-[1fr_1fr_5rem] gap-3">
        <label className="block text-sm">Room<input className="field mt-2" value={v.room} onChange={e => set({ room: e.target.value })} /></label>
        <label className="block text-sm">Faculty<input className="field mt-2" value={v.faculty} onChange={e => set({ faculty: e.target.value })} /></label>
        <label className="block text-sm">Section<input className="field mt-2" value={v.section} onChange={e => set({ section: e.target.value })} /></label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">{session ? <><Check />Save changes</> : <><Plus />Add class</>}</Button>
    </form>
  </Modal>;
}
