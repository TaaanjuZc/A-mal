# A’mal

Your everyday space — tasks, Namaz, class routines, notes, and reminders on one personalized dashboard.

## Development

You need Node.js and [Bun](https://bun.sh).

```sh
bun install
bun run dev      # start the app
bun run test     # unit tests
bun run build    # production build
```

## Built with

- TanStack Start, React, TypeScript, Tailwind CSS
- `adhan` for on-device prayer-time calculation
- `@dnd-kit` for the drag-and-drop dashboard and note blocks
- `mammoth` (DOCX), SheetJS (XLS/XLSX) and `tesseract.js` (PNG OCR) for class-routine extraction, with an optional AI fallback for complex layouts

## Data

Everything is stored per user id in the browser for now (`src/lib/daywell/storage.ts`). `db/schema.sql` is the matching PostgreSQL schema — including accounts, sessions, and row-level security — for when sign-in is added.
