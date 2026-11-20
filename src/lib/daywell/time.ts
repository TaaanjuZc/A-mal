import type { HHmm, ISODate } from './types';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function atTime(date: ISODate, time: HHmm): Date {
  const d = parseISODate(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function formatTime(time: HHmm): string {
  const [h = NaN, m = 0] = time.split(':').map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${suffix}`;
}

export function formatRange(start: HHmm, end: HHmm) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatClock(date: Date, timeZone?: string) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone });
}

export function formatLongDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatRelative(ms: number) {
  const mins = Math.round(ms / 60000);
  if (Math.abs(mins) < 1) return 'now';
  const abs = Math.abs(mins);
  const text = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)}h ${abs % 60 ? `${abs % 60}m` : ''}`.trim();
  return mins > 0 ? `in ${text}` : `${text} ago`;
}

export function greetingFor(date: Date, name: string) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return `A fresh day, ${name} ☀`;
  if (h >= 12 && h < 17) return `Good afternoon, ${name}`;
  return `Hope you're having a productive day, ${name}`;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '·';
}

export function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
