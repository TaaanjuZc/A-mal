<p align="center">
  <img src="public/icon-512.png" alt="Wajib logo" width="96" height="96" />
</p>

<h1 align="center">Wajib</h1>

<p align="center">
  A personal everyday planner for students — tasks, Namaz, class routine, notes and spending in one place, built for the phone first.
</p>

---

## What is Wajib?

**Wajib** is a daily-life web app that keeps everything a university student in Bangladesh juggles in one calm space:
what to do today, when the next prayer is, which class is next and in which room, what to remember, and whether this month’s spending is still on track.

It greets you by name, works in a dark and a cream (light) theme, and is designed mainly for mobile screens with a bottom navigation bar. On a laptop it switches to a sidebar layout.

Everything you enter is saved on your own device — there is no account and nothing is sent to a server (except a routine file, if you choose AI reading; see below).

## Features

### Home (dashboard)
- Time-of-day greeting with your name (“Good morning, Ayesha”).
- At-a-glance cards: today’s tasks done, prayers recorded, money spent today, classes today.
- Blocks for today’s tasks, Namaz, the next class, what’s coming up, reminders and recent notes.
- The layout is yours: show, hide, reorder and resize blocks in **Settings → Home screen**. The class block hides itself when you have no routine.

### Tasks
- Plan tasks with a time, category, description and an optional reminder.
- Repeat daily, on weekdays (Sun–Thu), weekly or monthly.
- Status updates on its own from the clock — *upcoming*, *in progress*, *overdue* — or mark it done yourself.
- Browse by day. Past days are read-only: you can’t plan something for a day that has already gone.
- After 11 PM, a new task defaults to tomorrow.

### Namaz
- Five daily prayer times (plus sunrise) calculated on the device for your city — Dhaka, Chattogram, Sylhet, Rajshahi, Khulna and more, your GPS location, or custom coordinates.
- **Islamic Foundation Bangladesh timetable** by default for Bangladesh, so times match mosques and newspapers (it adds the official safety minutes). Exact astronomical times are one switch away.
- Hanafi or standard Asr, a choice of calculation methods, and ± minute adjustments per prayer.
- A live countdown to the next prayer, a daily checklist to record prayers, and optional prayer reminders.

### Class routine
- Upload your routine as **DOCX, DOC, XLSX, XLS, PNG or JPG**. Wajib reads the course, day, time, room, faculty and section, then shows everything in an editable review table before saving — nothing is guessed or invented.
- Understands university day codes: **S** Sunday, **M** Monday, **T** Tuesday, **W** Wednesday, **R** Thursday (e.g. `ST`, `MW`, `TR`, `SR`; labs use one letter).
- Weekly timetable with a countdown to the next class, a live “in class” timer, and start/end buttons for when a class runs early or late.
- Optional “Read with AI” for unusual layouts — the file is only sent when you tap it.

### Notes
- Notion-style editor: headings, bullet and numbered lists, checklists, quotes and dividers, with bold/italic/underline/strike, drag-to-reorder blocks, colours and categories. Markdown shortcuts work (`#`, `-`, `1.`, `[]`, `>`, `---`).
- **Every-day notes** — a checklist that starts fresh each day (morning adhkar, Quran, habits). Each day’s ticks are kept as a record, with a 4-week history grid and a streak.
- **Journal** — one entry per date; “Today’s journal” opens or creates today’s page.
- Delete a single day’s record, clear a note’s history, delete one note, or delete everything in a tab.
- **Export to Excel** — one `.xlsx` file with sheets for the journal, daily summaries, daily checklist items and plain notes. Google Sheets opens it via *File → Import*.

### Expenses
- Add spending in Taka by category (Food, Transport, Shopping, Bills, Education, Health, Fun, Other).
- Set a **monthly budget** and optional per-category limits.
- See how much you can safely spend today, your daily average, a projection for the month, a day-by-day chart and a comparison with last month.
- Warnings the moment a purchase takes you over a category limit or the monthly budget.

### Reminders
- Reminders for tasks, classes and prayers, shown in the bell inbox and — if you allow it — as system notifications.
- Reminders you miss while the app is closed appear in the bell when you come back.

### Settings
- Your name, theme, task categories, monthly budget, reminder options and home-screen layout.

## How it works

```
Browser
 ├─ Pages (src/routes)             one route per module: /, /tasks, /namaz, /classes, /notes, /expenses, /settings
 ├─ UI (src/components/planner)    the screens and the app shell
 ├─ State (state.tsx)              PlannerProvider holds all of your data and saves every change
 ├─ Logic (src/lib/daywell)        pure functions: tasks, prayer times, classes, budget, notes, reminders, routine parser
 └─ Storage (storage.ts)           browser localStorage, namespaced per local profile
```

- **Your data stays on your device.** `PlannerProvider` keeps tasks, notes, expenses, routines, prayers and preferences in memory and writes every change to `localStorage` through `src/lib/daywell/storage.ts`. Each record carries a `userId`, so the data can later move 1:1 into an online account.
- **Everything time-based is calculated from the clock**, not from counters: task status, class countdowns, the next prayer and reminders are all derived from timestamps each time the screen refreshes. That keeps them correct after the phone sleeps or the tab is closed.
- **Prayer times** come from the [`adhan`](https://github.com/batoulapps/adhan-js) library (Karachi method, Hanafi Asr by default), with the Islamic Foundation Bangladesh safety minutes applied on top.
- **Routine reading** happens in the browser: `mammoth` for Word files, SheetJS for Excel, and `tesseract.js` for photos/screenshots (OCR). A parser (`routine-parser.ts`) finds tables, time ranges, day codes, rooms, faculty initials and sections. If you choose AI reading, only that file is sent to the server.
- **Reminders** are rebuilt from your current tasks, classes and prayer times, so editing or deleting something updates its reminder automatically. A service worker (`public/sw.js`) shows the notifications.
- **Database-ready.** `db/schema.sql` is a PostgreSQL schema that mirrors the stored collections (users, tasks, notes and daily records, routines, expenses, prayer logs, reminders, preferences) for when sign-in and sync are added.

## Tech stack

- [TanStack Start](https://tanstack.com/start) + TanStack Router, React, TypeScript
- Tailwind CSS v4 with semantic theme tokens (`src/styles.css`) for dark and cream themes
- `adhan` (prayer times) and `@dnd-kit` (drag and drop)
- `mammoth`, `xlsx` (SheetJS) and `tesseract.js` for routine reading; SheetJS also writes the notes Excel export
- `lucide-react` icons, `sonner` toasts
- Vitest for tests

## Run it locally

You need [Node.js](https://nodejs.org) and [Bun](https://bun.sh) (npm also works).

```sh
bun install
bun run dev        # start the app at http://localhost:5173
bun run test       # run the unit tests
bun run build      # production build
bun run preview    # preview the production build
```

AI routine reading is optional and needs an AI gateway key in the server environment (see `src/lib/ai/routine-extract.server.ts`). Without it, everything else — including normal routine reading — works.

## Project structure

```
src/
  routes/               pages (one file per module)
  components/planner/   app shell, dashboard, tasks, namaz, classes, notes, expenses, settings
  components/ui/        shared buttons, dialogs and inputs
  lib/daywell/          storage, types and all the logic (tasks, prayer, classes, budget, notes, reminders, routine parser)
  lib/ai/               optional server-side AI routine reader
  test/                 unit tests
public/                 favicon, app icons, service worker
db/schema.sql           PostgreSQL schema
```
