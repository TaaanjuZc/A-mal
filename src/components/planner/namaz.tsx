import { useState } from 'react';
import { Check, LocateFixed, Moon, Sun, Sunrise } from 'lucide-react';
import { NamazIcon } from './namaz-icon';
import { Button } from '@/components/ui/button';
import { CITIES, METHOD_LABEL, PRAYERS, nextPrayer, prayerTimesFor, usesIslamicFoundation, zoneLabel } from '@/lib/daywell/prayer';
import { formatClock, formatDuration, toISODate } from '@/lib/daywell/time';
import type { PrayerSettings } from '@/lib/daywell/types';
import { PageHeading } from './shell';
import { useNow, usePlanner } from './state';

export function Prayers({ compact }: { compact?: boolean }) {
  const { prefs, prayerLog, togglePrayer } = usePlanner();
  const now = useNow(60_000);
  const at = new Date(now);
  const times = prayerTimesFor(prefs.prayer, at);
  const today = toISODate(at);
  const recorded = prayerLog[today] ?? [];
  const next = nextPrayer(prefs.prayer, at);
  return <div>
    {PRAYERS.map((p, i) => {
      const done = recorded.includes(p);
      return <div key={p}>
        <Button variant="ghost" className="prayer-button" aria-pressed={done} aria-label={`${done ? 'Unmark' : 'Record'} ${p}`} onClick={() => togglePrayer(p, today)}>
          <span className="flex items-center gap-3 text-sm">{i === 0 ? <Sun className="text-muted-foreground" /> : <Moon className="text-muted-foreground" />}{p}{next.name === p && next.at.getTime() - now < 86_400_000 && <span className="tag bg-yellow text-ink">Next</span>}</span>
          <span className="flex items-center gap-4"><span className="text-xs text-muted-foreground">{formatClock(times[p], prefs.prayer.timeZone)}</span><span className={`size-5 border rounded-full grid place-items-center ${done ? 'bg-lime text-ink border-lime' : 'border-border'}`}>{done && <Check size={12} />}</span></span>
        </Button>
        {i === 0 && !compact && <div className="flex justify-between items-center h-10 border-b border-border text-xs text-muted-foreground"><span className="flex items-center gap-3"><Sunrise size={16} />Sunrise</span><span className="mr-9">{formatClock(times.Sunrise, prefs.prayer.timeZone)}</span></div>}
      </div>;
    })}
  </div>;
}

export function NextPrayerCard() {
  const { prefs } = usePlanner();
  const now = useNow(1000);
  const next = nextPrayer(prefs.prayer, new Date(now));
  return <div className="bg-yellow text-ink rounded-lg p-8">
    <NamazIcon size={36} />
    <p className="text-sm mt-8">NEXT PRAYER</p>
    <h2 className="text-4xl font-semibold mt-2">{next.name}</h2>
    <p className="mt-3">{formatClock(next.at, prefs.prayer.timeZone)} · {prefs.prayer.locationName}</p>
    <p className="text-2xl font-semibold mt-6 tabular-nums" aria-live="off">in {formatDuration(next.at.getTime() - now)}</p>
    <p className="text-xs opacity-60 mt-6">{prefs.prayer.madhab === 'hanafi' ? 'Hanafi' : 'Shafi‘i'} Asr · {usesIslamicFoundation(prefs.prayer) ? 'Islamic Foundation Bangladesh' : METHOD_LABEL[prefs.prayer.method]} · {zoneLabel(prefs.prayer.timeZone)}</p>
  </div>;
}

export function NamazPage() {
  const { prayers } = usePlanner();
  return <>
    <PageHeading title="A moment to reconnect." subtitle="Your five daily prayers, calculated for your location every day." />
    <div className="grid md:grid-cols-2 gap-6 max-w-5xl">
      <div className="panel p-6"><div className="flex justify-between mb-5"><h2 className="section-title">Today’s Namaz</h2><span className="tag">{prayers.length} / 5 recorded</span></div><Prayers /></div>
      <NextPrayerCard />
    </div>
    <PrayerSettingsPanel />
  </>;
}

function PrayerSettingsPanel() {
  const { prefs, updatePrefs } = usePlanner();
  const p = prefs.prayer;
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const set = (patch: Partial<PrayerSettings>) => updatePrefs(x => ({ ...x, prayer: { ...x.prayer, ...patch } }));
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [p.timeZone];
  const cityIndex = CITIES.findIndex(c => c.name === p.locationName);

  function locate() {
    if (!('geolocation' in navigator)) { setGeoError('Location isn’t available in this browser. Pick a city instead.'); return; }
    setLocating(true); setGeoError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        set({ latitude: +latitude.toFixed(4), longitude: +longitude.toFixed(4), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locationName: `My location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})` });
        setLocating(false);
      },
      err => { setGeoError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Pick a city or enter coordinates.' : 'Couldn’t get your location. Try again or pick a city.'); setLocating(false); },
      { timeout: 15000, maximumAge: 3_600_000 },
    );
  }

  return <section className="panel p-6 max-w-5xl mt-6">
    <h2 className="section-title mb-1">Prayer settings</h2>
    <p className="text-xs text-muted-foreground mb-5">Times are calculated on your device from your location — they update automatically each day and when you change these settings.</p>
    <div className="grid md:grid-cols-2 gap-5">
      <div className="space-y-4">
        <label className="block text-sm">City<select className="field mt-2" value={cityIndex} onChange={e => { const c = CITIES[Number(e.target.value)]; if (c) set({ locationName: c.name, latitude: c.latitude, longitude: c.longitude, timeZone: c.timeZone, method: c.method }); }}>{cityIndex < 0 && <option value={-1}>{p.locationName}</option>}{CITIES.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}</select></label>
        <Button variant="secondary" onClick={locate} disabled={locating}><LocateFixed />{locating ? 'Finding you…' : 'Use my current location'}</Button>
        {geoError && <p role="alert" className="text-xs text-destructive">{geoError}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Latitude<input type="number" step="0.0001" min={-90} max={90} className="field mt-2" value={p.latitude} onChange={e => e.target.value && set({ latitude: Number(e.target.value), locationName: 'Custom location' })} /></label>
          <label className="block text-sm">Longitude<input type="number" step="0.0001" min={-180} max={180} className="field mt-2" value={p.longitude} onChange={e => e.target.value && set({ longitude: Number(e.target.value), locationName: 'Custom location' })} /></label>
        </div>
        <label className="block text-sm">Time zone<select className="field mt-2" value={p.timeZone} onChange={e => set({ timeZone: e.target.value })}>{zones.map(z => <option key={z}>{z}</option>)}</select></label>
      </div>
      <div className="space-y-4">
        <label className="block text-sm">Calculation method<select className="field mt-2" value={p.method} onChange={e => set({ method: e.target.value as PrayerSettings['method'] })}>{Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block text-sm">Asr calculation<select className="field mt-2" value={p.madhab} onChange={e => set({ madhab: e.target.value as PrayerSettings['madhab'] })}><option value="hanafi">Hanafi (later Asr)</option><option value="shafi">Standard — Shafi‘i, Maliki, Hanbali</option></select></label>
        <label className="block text-sm">Timetable<select className="field mt-2" value={usesIslamicFoundation(p) ? 'islamic-foundation' : 'astronomical'} onChange={e => set({ timetable: e.target.value as NonNullable<PrayerSettings['timetable']> })}>
          <option value="islamic-foundation">Islamic Foundation Bangladesh (matches mosque times)</option>
          <option value="astronomical">Exact astronomical times</option>
        </select>
          <span className="block text-xs text-muted-foreground mt-2">Islamic Foundation adds a few safety minutes (e.g. Maghrib 3–4 min after sunset), as used by mosques and newspapers in Bangladesh.</span></label>
        <div>
          <p className="text-sm mb-2">Adjustments &amp; reminders</p>
          {PRAYERS.map(name => <div key={name} className="flex items-center gap-3 py-1.5 text-sm">
            <span className="w-16">{name}</span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="number" min={-30} max={30} aria-label={`${name} adjustment in minutes`} className="field w-16 py-1 px-2" value={p.adjustments[name]} onChange={e => set({ adjustments: { ...p.adjustments, [name]: Math.max(-30, Math.min(30, Number(e.target.value) || 0)) } })} />min</label>
            <label className="flex items-center gap-2 ml-auto text-xs"><input type="checkbox" checked={p.reminders[name]} onChange={e => set({ reminders: { ...p.reminders, [name]: e.target.checked } })} />Remind me</label>
          </div>)}
          <label className="flex items-center gap-2 text-sm mt-3">Remind me<select className="field w-auto py-1" value={p.reminderMinutes} onChange={e => set({ reminderMinutes: Number(e.target.value) })}>{[0, 5, 10, 15, 20, 30].map(m => <option key={m} value={m}>{m ? `${m} min before` : 'at prayer time'}</option>)}</select></label>
        </div>
      </div>
    </div>
  </section>;
}
