import { CalculationMethod, Coordinates, Madhab, PrayerTimes, Rounding } from 'adhan';
import type { PrayerName, PrayerSettings } from './types';

export const PRAYERS: PrayerName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export const METHOD_LABEL: Record<PrayerSettings['method'], string> = {
  Karachi: 'University of Islamic Sciences, Karachi',
  MuslimWorldLeague: 'Muslim World League',
  Egyptian: 'Egyptian General Authority',
  UmmAlQura: 'Umm al-Qura, Makkah',
  Dubai: 'Dubai',
  MoonsightingCommittee: 'Moonsighting Committee',
  NorthAmerica: 'ISNA (North America)',
  Kuwait: 'Kuwait',
  Qatar: 'Qatar',
  Singapore: 'Singapore',
  Tehran: 'Tehran',
  Turkey: 'Diyanet (Turkey)',
};

export const CITIES: { name: string; latitude: number; longitude: number; timeZone: string; method: PrayerSettings['method'] }[] = [
  { name: 'Dhaka, Bangladesh', latitude: 23.8103, longitude: 90.4125, timeZone: 'Asia/Dhaka', method: 'Karachi' },
  { name: 'Chattogram, Bangladesh', latitude: 22.3569, longitude: 91.7832, timeZone: 'Asia/Dhaka', method: 'Karachi' },
  { name: 'Sylhet, Bangladesh', latitude: 24.8949, longitude: 91.8687, timeZone: 'Asia/Dhaka', method: 'Karachi' },
  { name: 'Rajshahi, Bangladesh', latitude: 24.3745, longitude: 88.6042, timeZone: 'Asia/Dhaka', method: 'Karachi' },
  { name: 'Khulna, Bangladesh', latitude: 22.8456, longitude: 89.5403, timeZone: 'Asia/Dhaka', method: 'Karachi' },
  { name: 'Kolkata, India', latitude: 22.5726, longitude: 88.3639, timeZone: 'Asia/Kolkata', method: 'Karachi' },
  { name: 'Karachi, Pakistan', latitude: 24.8607, longitude: 67.0011, timeZone: 'Asia/Karachi', method: 'Karachi' },
  { name: 'Makkah, Saudi Arabia', latitude: 21.3891, longitude: 39.8579, timeZone: 'Asia/Riyadh', method: 'UmmAlQura' },
  { name: 'Dubai, UAE', latitude: 25.2048, longitude: 55.2708, timeZone: 'Asia/Dubai', method: 'Dubai' },
  { name: 'Kuala Lumpur, Malaysia', latitude: 3.139, longitude: 101.6869, timeZone: 'Asia/Kuala_Lumpur', method: 'Singapore' },
  { name: 'Istanbul, Türkiye', latitude: 41.0082, longitude: 28.9784, timeZone: 'Europe/Istanbul', method: 'Turkey' },
  { name: 'London, UK', latitude: 51.5072, longitude: -0.1276, timeZone: 'Europe/London', method: 'MoonsightingCommittee' },
  { name: 'New York, USA', latitude: 40.7128, longitude: -74.006, timeZone: 'America/New_York', method: 'NorthAmerica' },
  { name: 'Toronto, Canada', latitude: 43.6532, longitude: -79.3832, timeZone: 'America/Toronto', method: 'NorthAmerica' },
  { name: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093, timeZone: 'Australia/Sydney', method: 'MuslimWorldLeague' },
];

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  locationName: 'Dhaka, Bangladesh',
  latitude: 23.8103,
  longitude: 90.4125,
  timeZone: 'Asia/Dhaka',
  method: 'Karachi',
  madhab: 'hanafi',
  adjustments: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
  reminders: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
  reminderMinutes: 10,
};

export type DayPrayerTimes = Record<PrayerName | 'Sunrise', Date>;

/** Calendar date (y, m, d) as observed in the prayer location's own timezone. */
function dateInZone(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/**
 * Safety minutes (ihtiyat) in the Islamic Foundation Bangladesh timetable that mosques and newspapers follow,
 * on top of the Karachi/Hanafi calculation. Fitted against its published Dhaka times for November and June;
 * the result matches to the minute, except Asr/Maghrib/Isha can differ by a minute in some seasons.
 */
const IFB_SAFETY_SECONDS: Record<PrayerName | 'Sunrise', number> = { Fajr: 45, Sunrise: 0, Dhuhr: 162, Asr: 0, Maghrib: 240, Isha: 120 };
const NO_SAFETY: Record<PrayerName | 'Sunrise', number> = { Fajr: 0, Sunrise: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };

export function usesIslamicFoundation(settings: PrayerSettings) {
  return settings.timetable ? settings.timetable === 'islamic-foundation' : settings.timeZone === 'Asia/Dhaka';
}

const cache = new Map<string, DayPrayerTimes>();

/**
 * Deterministic astronomical calculation (no network, no AI). Results are absolute instants,
 * so formatting them in `settings.timeZone` handles daylight-saving changes automatically.
 */
export function prayerTimesFor(settings: PrayerSettings, at: Date, dayOffset = 0): DayPrayerTimes {
  const { y, m, d } = dateInZone(at, settings.timeZone);
  const key = JSON.stringify([settings.latitude, settings.longitude, settings.method, settings.madhab, usesIslamicFoundation(settings), settings.adjustments, y, m, d + dayOffset]);
  const hit = cache.get(key);
  if (hit) return hit;
  const params = CalculationMethod[settings.method]();
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.rounding = Rounding.None;
  const t = new PrayerTimes(new Coordinates(settings.latitude, settings.longitude), new Date(y, m - 1, d + dayOffset), params);
  const safety = usesIslamicFoundation(settings) ? IFB_SAFETY_SECONDS : NO_SAFETY;
  const final = (raw: Date, name: PrayerName | 'Sunrise') => {
    const seconds = raw.getTime() / 1000 + safety[name] + (name === 'Sunrise' ? 0 : settings.adjustments[name] * 60);
    return new Date(Math.round(seconds / 60) * 60_000);
  };
  const result: DayPrayerTimes = {
    Fajr: final(t.fajr, 'Fajr'), Sunrise: final(t.sunrise, 'Sunrise'), Dhuhr: final(t.dhuhr, 'Dhuhr'),
    Asr: final(t.asr, 'Asr'), Maghrib: final(t.maghrib, 'Maghrib'), Isha: final(t.isha, 'Isha'),
  };
  if (cache.size > 60) cache.clear();
  cache.set(key, result);
  return result;
}

export function nextPrayer(settings: PrayerSettings, now: Date): { name: PrayerName; at: Date } {
  const today = prayerTimesFor(settings, now);
  const upcoming = PRAYERS.find(p => today[p].getTime() > now.getTime());
  if (upcoming) return { name: upcoming, at: today[upcoming] };
  return { name: 'Fajr', at: prayerTimesFor(settings, now, 1).Fajr };
}

export function zoneLabel(timeZone: string, at = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(at).find(p => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}
