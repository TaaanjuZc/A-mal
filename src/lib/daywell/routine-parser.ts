import type { ClassSession } from './types';

export type ExtractedClass = Omit<ClassSession, 'id' | 'userId' | 'routineId'>;
export type Extraction = { rows: ExtractedClass[]; rawText: string; method: string };
export type Grid = string[][];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['docx', 'doc', 'xlsx', 'xls', 'png', 'jpg', 'jpeg'] as const;
export const ACCEPT_ATTR = '.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg';

export function fileKind(file: File): 'docx' | 'doc' | 'sheet' | 'image' | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'xlsx' || ext === 'xls') return 'sheet';
  if (['png', 'jpg', 'jpeg'].includes(ext) && (!file.type || file.type.startsWith('image/'))) return 'image';
  return null;
}

export function validateFile(file: File): string | null {
  if (!fileKind(file)) return 'Please upload a DOC, DOCX, XLS, XLSX, or PNG file.';
  if (file.size > MAX_FILE_BYTES) return 'Please use a file under 10 MB.';
  if (file.size === 0) return 'This file looks empty.';
  return null;
}

// ─── Text normalisation ────────────────────────────────────────────────────────

export function clean(s: unknown, max = 120): string {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const DAY_PATTERN = /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|sday|nesday|rsday|urday)?\b/gi;
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
// University day codes: S Sun, M Mon, T Tue, W Wed, R Thu, F Fri, A Sat — "ST" = Sun+Tue, "MW", "TR", "SR"; labs use one letter.
const DAY_CODE: Record<string, number> = { S: 0, M: 1, T: 2, W: 3, R: 4, F: 5, A: 6 };

/** Days for an uppercase code like "ST" or "R"; null when it isn't one (repeated letters, other characters). */
export function codeDays(token: string): number[] | null {
  if (!/^[SMTWRFA]{1,3}$/.test(token) || new Set(token).size !== token.length) return null;
  return [...token].map(c => DAY_CODE[c] ?? 0).sort((a, b) => a - b);
}

export function parseDays(text: string, allowCodes = false): number[] {
  const days = new Set<number>();
  for (const m of text.matchAll(DAY_PATTERN)) {
    const d = DAY_INDEX[(m[1] ?? '').slice(0, 3).toLowerCase()];
    if (d !== undefined) days.add(d);
  }
  if (!days.size && allowCodes) {
    for (const d of codeDays(text.trim().toUpperCase().replace(/[\s,/&+-]+/g, '')) ?? []) days.add(d);
  }
  return [...days].sort((a, b) => a - b);
}

const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?`;
const RANGE = new RegExp(`${T}\\s*(?:-|–|—|to|~)\\s*${T}`, 'i');
const SINGLE = new RegExp(`^\\s*${T}\\s*$`, 'i');

function to24(h: number, mer: string | undefined): number {
  if (!mer) return h;
  const pm = mer.toLowerCase().startsWith('p');
  return (h % 12) + (pm ? 12 : 0);
}
const fmt = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Class hours without AM/PM (e.g. "1:30") are assumed to be afternoon — classes rarely run 1–7 AM. */
function inferHour(h: number) {
  return h >= 1 && h <= 7 ? h + 12 : h;
}

export function parseTimeRange(text: string): { start: string; end: string } | null {
  const m = text.match(RANGE);
  if (!m) return null;
  const [, h1s = '', m1s, mer1, h2s = '', m2s, mer2] = m;
  if (!m1s && !m2s && !mer1 && !mer2) return null; // "115-2" is a course code, not a time
  let h1 = Number(h1s), h2 = Number(h2s);
  if (h1 > 23 || h2 > 23) return null;
  const min1 = Number(m1s ?? 0), min2 = Number(m2s ?? 0);
  if (min1 > 59 || min2 > 59) return null;
  if (mer1 || mer2) {
    const e = to24(h2, mer2 ?? mer1);
    let s = to24(h1, mer1 ?? mer2);
    if (!mer1 && s > e) s = to24(h1, 'am');
    h1 = s; h2 = e;
  } else if (h1 <= 12 && h2 <= 12) {
    h1 = inferHour(h1); h2 = inferHour(h2);
    if (h2 < h1) h2 += 12;
  }
  if (h2 > 23) return null;
  return { start: fmt(h1, min1), end: fmt(h2, min2) };
}

export function parseSingleTime(text: string): string | null {
  const m = text.match(SINGLE);
  if (!m) return null;
  const [, hs = '', ms, mer] = m;
  const h = Number(hs), min = Number(ms ?? 0);
  if (h > 23 || min > 59 || (!ms && !mer)) return null;
  return fmt(mer ? to24(h, mer) : h <= 12 ? inferHour(h) : h, min);
}

export type Schedule = { days: number[]; start: string; end: string };

const RANGE_G = new RegExp(RANGE.source, 'gi');
const LEAD_CODE = /(?:^|[^A-Za-z0-9])([SMTWRFA]{1,3})\s*[:,-]?\s*$/;
const TRAIL_CODE = /^\s*[:,-]?\s*([SMTWRFA]{1,3})(?![A-Za-z0-9])/;

/**
 * Every "days + time range" in a piece of text: "ST 08:00 AM - 09:30 AM", "R 8:00-11:10 AM",
 * "Sunday 9:40 AM - 11:10 AM". Codes are only trusted right next to a time, where they can't be initials.
 * Also returns the text with those parts blanked out so the remaining fields can be read.
 */
export function readSchedules(text: string, fallbackDays: number[] = []): { schedules: Schedule[]; rest: string } {
  const ranges = [...text.matchAll(RANGE_G)].flatMap(m => { const r = parseTimeRange(m[0]); return r ? [{ ...r, at: m.index ?? 0, len: m[0].length }] : []; });
  const blank: [number, number][] = [];
  const schedules: Schedule[] = [];
  let prevEnd = 0;
  ranges.forEach((r, i) => {
    const end = r.at + r.len;
    const before = text.slice(prevEnd, r.at);
    const after = text.slice(end, ranges[i + 1]?.at ?? text.length);
    blank.push([r.at, end]);
    let days: number[] = [];
    const lead = before.match(LEAD_CODE);
    const trail = after.match(TRAIL_CODE);
    const leadDays = lead?.[1] ? codeDays(lead[1]) : null;
    const trailDays = trail?.[1] ? codeDays(trail[1]) : null;
    if (leadDays && lead?.[1]) {
      days = leadDays;
      const at = prevEnd + before.lastIndexOf(lead[1]);
      blank.push([at, at + lead[1].length]);
    } else if (parseDays(before).length) {
      days = parseDays(before);
    } else if (trailDays && trail) {
      days = trailDays;
      blank.push([end, end + trail[0].length]);
    }
    prevEnd = end;
    schedules.push({ days: days.length ? days : fallbackDays, start: r.start, end: r.end });
  });
  let rest = text;
  for (const [a, b] of blank.sort((x, y) => y[0] - x[0])) rest = `${rest.slice(0, a)} ${rest.slice(b)}`;
  return { schedules, rest: rest.replace(DAY_PATTERN, ' ') };
}

// ─── Field extraction from a free-text cell or line ───────────────────────────

const CODE = /\b([A-Z]{2,5})\s?-?\s?(\d{3,4}[A-Z]?)(?:\s?[./-]\s?(\d{1,2}))?(?![\d:])/;
const ROOM = /\b(?:room|rm|class\s?room|venue)\.?\s*(?:no\.?)?\s*[:#-]?\s*([A-Z]{0,5}\s?-?\d{1,4}[A-Z]?)\b/i;
const ROOM_LIKE = /\b([A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?)\b/;
const SECTION = /\b(?:sec(?:tion)?|grp|group)\.?\s*[:#-]?\s*([A-Z0-9]{1,3})\b/i;
const FACULTY = /\b(?:faculty|instructor|teacher|lecturer|course\s?teacher|taught\s?by)\s*[:-]\s*([A-Z][A-Za-z.' -]{1,48})/i;
const TITLED = /\b((?:Dr|Prof|Professor|Mr|Mrs|Ms|Md|Engr)\.?\s+[A-Z][A-Za-z.' -]{1,40})/;
const INITIALS = /\(([A-Z]{2,5}\d?)\)/;
const NOT_INITIALS = new Set(['LAB', 'TBA', 'TBD', 'AND', 'THE', 'FOR', 'OF', 'TO', 'IN', 'AM', 'PM', 'II', 'III', 'IV', 'VI', 'AI']);

/** A standalone faculty initial such as "MSA" or "NbM1" — but not a word inside an ALL-CAPS course title. */
function bareInitials(rest: string): string {
  const caps = (t?: string) => !!t && /^[A-Z]{2,}$/.test(t);
  for (const cell of rest.split('|').reverse()) {
    const tokens = cell.split(/[\s,;]+/).filter(Boolean);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i] ?? '';
      if (!/^[A-Z][A-Za-z]{1,4}\d?$/.test(t) || !/[A-Z].*[A-Z]/.test(t) || NOT_INITIALS.has(t.toUpperCase())) continue;
      if (t.length <= 2 && codeDays(t)) continue;
      if (caps(tokens[i - 1]) || caps(tokens[i + 1])) continue;
      return t;
    }
  }
  return '';
}

const PLACEHOLDER = /^(tba|tbd|n\/?a|-+|—)$/i;
const known = (s: string) => (PLACEHOLDER.test(s.trim()) ? '' : s);

export function parseCellText(text: string): Partial<ExtractedClass> {
  let rest = ` ${readSchedules(text).rest.replace(/\b(TBA|TBD)\b/g, ' ')} `;
  const take = (re: RegExp) => {
    const m = rest.match(re);
    if (!m) return '';
    rest = rest.replace(m[0], ' ');
    return (m[1] ?? '').trim();
  };
  let faculty = take(FACULTY) || take(TITLED) || take(INITIALS);
  let room = take(ROOM);
  let section = take(SECTION);
  const codeMatch = rest.match(CODE);
  let courseCode = '';
  if (codeMatch) {
    const [whole, , , suffix] = codeMatch;
    courseCode = suffix ? whole.slice(0, whole.lastIndexOf(suffix)).replace(/[\s./-]+$/, '') : whole;
    if (!section && suffix) section = suffix;
    rest = rest.replace(whole, ' ');
    // With a course code found, the next code-shaped token ("NAC511", "SAC 302") is the room
    // and a lone 1–2 digit number is the section.
    if (!room) room = take(ROOM_LIKE);
    if (!section) section = take(/(?:^|[\s|,;])(\d{1,2})(?=$|[\s|,;])/);
    if (!faculty) {
      faculty = bareInitials(rest);
      if (faculty) rest = rest.replace(new RegExp(`(^|[\\s|,;])${faculty}(?=$|[\\s|,;])`), ' ');
    }
  }
  const leftover = clean(rest.replace(/[|,;:/\\[\](){}=_~*"'`]+/g, ' ').replace(/\s[-–—]\s/g, ' '), 80).replace(/^[-–—.\s]+|[-–—.\s]+$/g, '');
  const courseName = /[A-Za-z]{2}/.test(leftover) ? leftover : '';
  return { courseCode: clean(courseCode, 20), courseName, room: clean(room, 30), faculty: clean(faculty, 60), section: clean(section, 10) };
}

// ─── Table strategies ─────────────────────────────────────────────────────────

// Order matters: the first matching key claims a column ("Subject Code" is a code, not a name).
const HEADERS: Record<keyof ExtractedClass | 'time', RegExp> = {
  courseCode: /(course|subject)?\s*code|course\s*(no|id)/i,
  courseName: /course\s*(title|name)|subject|^course$|^title$/i,
  day: /^day|days|weekday/i,
  start: /start|from|begin/i,
  end: /^end|^to$|finish|until/i,
  time: /time|slot|schedule|period|hours?/i,
  room: /room|venue|location/i,
  faculty: /faculty|instructor|teacher|lecturer|initial/i,
  section: /sec(tion)?|group/i,
};

function headerMap(row: string[]) {
  const map: Partial<Record<keyof typeof HEADERS, number>> = {};
  row.forEach((cell, i) => {
    const c = cell.trim();
    if (!c || c.length > 40) return;
    for (const key of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
      if (map[key] === undefined && HEADERS[key].test(c)) { map[key] = i; break; }
    }
  });
  return map;
}

function fromHeaderTable(grid: Grid): ExtractedClass[] {
  for (let h = 0; h < Math.min(grid.length, 12); h++) {
    const map = headerMap(grid[h] ?? []);
    // A combined "Day & Time" column carries both.
    if (map.day !== undefined && map.time === undefined && map.start === undefined) map.time = map.day;
    // Days may live in their own column or inside the time cell ("ST 08:00 AM - 09:30 AM").
    const hasTime = map.time !== undefined || map.start !== undefined;
    if (Object.keys(map).length < 3 || !hasTime) continue;
    const out: ExtractedClass[] = [];
    let lastDays: number[] = [];
    for (const row of grid.slice(h + 1)) {
      const cell = (k: keyof typeof HEADERS) => { const i = map[k]; return i !== undefined ? clean(row[i], 300) : ''; };
      const dayCell = map.day !== undefined && map.day !== map.time ? cell('day') : '';
      const columnDays = dayCell ? parseDays(dayCell, true) : lastDays;
      if (dayCell) lastDays = columnDays;
      let schedules: Schedule[];
      if (map.time !== undefined) schedules = readSchedules(cell('time'), columnDays).schedules;
      else {
        const start = parseSingleTime(cell('start'));
        schedules = start ? [{ days: columnDays, start, end: parseSingleTime(cell('end')) || start }] : [];
      }
      if (!schedules.some(s => s.days.length)) continue;
      const course = parseCellText([cell('courseCode'), cell('courseName')].join(' | '));
      const fromRow = parseCellText(row.map(c => clean(c)).join(' | '));
      // A "Course" column often holds just the code ("CSE173" or "CSE173.5"), so split it unless there's a separate code column.
      const fields = {
        courseCode: cell('courseCode') ? clean(cell('courseCode').replace(/\s?[./-]\s?\d{1,2}$/, ''), 20) : course.courseCode ?? '',
        courseName: cell('courseCode') ? clean(cell('courseName'), 80) : course.courseName ?? '',
        section: cell('section') || course.section || (map.section === undefined ? fromRow.section : '') || '',
        room: known(map.room !== undefined ? cell('room') : fromRow.room ?? ''),
        faculty: known(map.faculty !== undefined ? cell('faculty') : fromRow.faculty ?? ''),
      };
      for (const s of schedules) for (const day of s.days) out.push({ day, start: s.start, end: s.end, ...fields });
    }
    if (out.length) return out;
  }
  return [];
}

/** Timetable grids: days down one axis, time slots across the other. */
function fromMatrix(grid: Grid): ExtractedClass[] {
  const attempt = (g: Grid) => {
    const headerIdx = g.findIndex(r => r.filter(c => parseTimeRange(c)).length >= 2);
    if (headerIdx < 0) return [];
    const slots = (g[headerIdx] ?? []).map(c => parseTimeRange(c));
    const out: ExtractedClass[] = [];
    let currentDays: number[] = [];
    for (const row of g.slice(headerIdx + 1)) {
      const dayCol = row.findIndex((c, i) => !slots[i] && parseDays(c, true).length > 0);
      if (dayCol >= 0) currentDays = parseDays(row[dayCol] ?? '', true);
      if (!currentDays.length) continue;
      for (let i = 0; i < row.length; i++) {
        const slot = slots[i];
        const text = clean(row[i], 300);
        if (!slot || !text || i === dayCol) continue;
        let end = slot.end;
        // A course spanning merged/adjacent slots becomes one longer class.
        while (i + 1 < row.length && slots[i + 1] && clean(row[i + 1], 300) === text) { end = slots[i + 1]!.end; i++; }
        const fields = parseCellText(text);
        if (!fields.courseCode && !fields.courseName) continue;
        for (const day of currentDays) out.push({ day, start: slot.start, end, courseName: '', courseCode: '', room: '', faculty: '', section: '', ...fields });
      }
    }
    return out;
  };
  const direct = attempt(grid);
  if (direct.length) return direct;
  const width = Math.max(0, ...grid.map(r => r.length));
  const transposed = Array.from({ length: width }, (_, c) => grid.map(r => r[c] ?? ''));
  return attempt(transposed);
}

/** Line-oriented text (OCR output, legacy .doc, paragraphs). */
export function fromLines(lines: string[]): ExtractedClass[] {
  const out: ExtractedClass[] = [];
  let contextDays: number[] = [];
  for (const raw of lines) {
    const line = clean(raw, 300);
    if (!line) continue;
    const { schedules } = readSchedules(line, contextDays);
    if (!schedules.length) {
      const days = parseDays(line, true);
      if (days.length) contextDays = days;
      continue;
    }
    const fields = parseCellText(line);
    if (!fields.courseCode && !fields.courseName) continue;
    for (const s of schedules) for (const day of s.days) out.push({ day, start: s.start, end: s.end, courseName: '', courseCode: '', room: '', faculty: '', section: '', ...fields });
  }
  return out;
}

export function parseGrids(grids: Grid[], lines: string[]): ExtractedClass[] {
  const rows: ExtractedClass[] = [];
  for (const g of grids) {
    const header = fromHeaderTable(g);
    if (header.length) { rows.push(...header); continue; }
    const matrix = fromMatrix(g);
    const perRow = fromLines(g.map(r => r.map(c => clean(c)).filter(Boolean).join(' | ')));
    rows.push(...(matrix.length >= perRow.length ? matrix : perRow));
  }
  if (!rows.length) rows.push(...fromLines([...lines, ...grids.flatMap(g => g.map(r => r.join(' ')))]));
  return dedupe(rows);
}

function dedupe(rows: ExtractedClass[]) {
  const seen = new Set<string>();
  return rows
    .filter(r => {
      const key = [r.day, r.start, r.courseCode, r.courseName].join('|').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

// ─── File readers (browser) ───────────────────────────────────────────────────

async function readDocx(buf: ArrayBuffer) {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const grids: Grid[] = [...doc.querySelectorAll('table')].map(t => [...t.querySelectorAll('tr')].map(tr => {
    const row: string[] = [];
    for (const td of tr.querySelectorAll('td,th')) {
      const span = Number(td.getAttribute('colspan') ?? 1);
      for (let i = 0; i < span; i++) row.push(td.textContent ?? '');
    }
    return row;
  }));
  doc.querySelectorAll('table').forEach(t => t.remove());
  const lines = [...doc.querySelectorAll('p,li,h1,h2,h3,h4')].map(p => p.textContent ?? '');
  return { grids, lines };
}

async function readSheet(buf: ArrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const grids: Grid[] = wb.SheetNames.flatMap(name => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: false }).map(r => r.map(c => String(c ?? '')));
    for (const m of ws['!merges'] ?? []) {
      const v = grid[m.s.r]?.[m.s.c] ?? '';
      for (let r = m.s.r; r <= m.e.r; r++) {
        const row = grid[r];
        if (row) for (let c = m.s.c; c <= m.e.c; c++) row[c] = v;
      }
    }
    return [grid];
  });
  return { grids, lines: [] as string[] };
}

/** Best effort for legacy binary .doc: recover readable text runs, then parse as lines. */
function readLegacyDoc(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
  const latin = new TextDecoder('latin1').decode(bytes);
  const runs = (s: string) => s.match(/[\x20-\x7E\r\n\t]{6,}/g) ?? [];
  const best = runs(utf16).join('').length > runs(latin).join('').length ? runs(utf16) : runs(latin);
  return { grids: [] as Grid[], lines: best.join('\n').split(/[\r\n]+/) };
}

/** Grayscale + contrast stretch + upscale small images — markedly improves OCR on screenshots. */
async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1, 1800 / Math.max(bitmap.width, bitmap.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const gray = new Float32Array(d.length / 4);
  let min = 255, max = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = (((gray[p] ?? 0) - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Common OCR slips in schedules: "O8:OO" → "08:00", "08 : 00" → "08:00", "AM-" glued to the next time. */
export function fixOcr(line: string): string {
  return line
    .replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI](?=\d)/g, '1')
    .replace(/(\d)\s*[:;.]\s*(\d{2})\b/g, '$1:$2')
    .replace(/([AaPp][Mm])(?=\d)/g, '$1 ');
}

async function readImage(file: File, onProgress?: (p: number) => void) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: m => { if (m.status === 'recognizing text') onProgress?.(m.progress); } });
  try {
    const canvas = await preprocessImage(file);
    const { data } = await worker.recognize(canvas);
    return { grids: [] as Grid[], lines: data.text.split('\n').map(fixOcr) };
  } finally {
    await worker.terminate();
  }
}

export async function extractFromFile(file: File, onProgress?: (p: number) => void): Promise<Extraction> {
  const kind = fileKind(file);
  let read: { grids: Grid[]; lines: string[] };
  let method: string;
  if (kind === 'docx') { read = await readDocx(await file.arrayBuffer()); method = 'Word document tables'; }
  else if (kind === 'sheet') { read = await readSheet(await file.arrayBuffer()); method = 'Spreadsheet cells'; }
  else if (kind === 'doc') { read = readLegacyDoc(await file.arrayBuffer()); method = 'Legacy Word text (best effort)'; }
  else if (kind === 'image') { read = await readImage(file, onProgress); method = 'Text recognition (OCR)'; }
  else throw new Error('Unsupported file type.');
  const rawText = [...read.grids.map(g => g.map(r => r.filter(Boolean).join(' | ')).join('\n')), read.lines.join('\n')].join('\n').slice(0, 30_000);
  return { rows: parseGrids(read.grids, read.lines), rawText, method };
}
