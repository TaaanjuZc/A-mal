import { describe, expect, it } from "vitest";
import { budgetSummary, categoryBreakdown, limitWarnings } from "@/lib/daywell/budget";
import { classState, occurrenceKey } from "@/lib/daywell/classes";
import { DEFAULT_PRAYER_SETTINGS, PRAYERS, prayerTimesFor } from "@/lib/daywell/prayer";
import { buildReminders } from "@/lib/daywell/reminders";
import { extractFromFile, fixOcr, fromLines, gridsFromPositioned, parseCellText, parseDays, parseGrids, parseTimeRange } from "@/lib/daywell/routine-parser";
import { occurrencesOn, occursOn, taskStatus } from "@/lib/daywell/tasks";
import { atTime, greetingFor } from "@/lib/daywell/time";
import { deleteDay, doneOn, notesWorkbookRows, setTick, streak, syncToday } from "@/lib/daywell/notes";
import type { ClassSession, Expense, Note, Preferences, Task } from "@/lib/daywell/types";

const task = (patch: Partial<Task> = {}): Task => ({
  id: "t1", userId: "u", title: "Write report", description: "", category: "Work",
  date: "2026-11-19", start: "10:00", end: "11:00", reminderMinutes: 10,
  recurrence: "none", recurrenceUntil: null, statusOverrides: {},
  createdAt: "", updatedAt: "", ...patch,
});

describe("task status", () => {
  const t = task();
  it("follows the schedule", () => {
    expect(taskStatus(t, "2026-11-19", atTime("2026-11-19", "09:00").getTime())).toBe("upcoming");
    expect(taskStatus(t, "2026-11-19", atTime("2026-11-19", "10:30").getTime())).toBe("in_progress");
  });
  it("becomes overdue — never silently completed — after the end time", () => {
    expect(taskStatus(t, "2026-11-19", atTime("2026-11-19", "12:00").getTime())).toBe("overdue");
  });
  it("respects manual completion", () => {
    const done = task({ statusOverrides: { "2026-11-19": "completed" } });
    expect(taskStatus(done, "2026-11-19", atTime("2026-11-19", "09:00").getTime())).toBe("completed");
  });
});

describe("recurrence", () => {
  it("expands weekly and daily tasks into future occurrences", () => {
    const weekly = task({ recurrence: "weekly" }); // 2026-11-19 is a Thursday
    expect(occursOn(weekly, "2026-11-26")).toBe(true);
    expect(occursOn(weekly, "2026-11-25")).toBe(false);
    expect(occursOn(weekly, "2026-11-12")).toBe(false);
    const daily = task({ recurrence: "daily", recurrenceUntil: "2026-11-21" });
    expect(occursOn(daily, "2026-11-21")).toBe(true);
    expect(occursOn(daily, "2026-11-22")).toBe(false);
  });
  it("tracks completion per occurrence", () => {
    const daily = task({ recurrence: "daily", statusOverrides: { "2026-11-20": "completed" } });
    const now = atTime("2026-11-21", "09:00").getTime();
    expect(occurrencesOn([daily], "2026-11-20", now)[0]?.status).toBe("completed");
    expect(occurrencesOn([daily], "2026-11-21", now)[0]?.status).toBe("upcoming");
  });
});

describe("greeting", () => {
  it("changes with the time of day", () => {
    expect(greetingFor(new Date(2026, 0, 1, 8), "Ayesha")).toBe("A fresh day, Ayesha ☀");
    expect(greetingFor(new Date(2026, 0, 1, 14), "Ayesha")).toBe("Good afternoon, Ayesha");
    expect(greetingFor(new Date(2026, 0, 1, 20), "Ayesha")).toBe("Hope you're having a productive day, Ayesha");
  });
});

describe("routine parsing", () => {
  it("parses time ranges with and without meridiem", () => {
    expect(parseTimeRange("9:40 AM - 11:10 AM")).toEqual({ start: "09:40", end: "11:10" });
    expect(parseTimeRange("1:00-2:30")).toEqual({ start: "13:00", end: "14:30" });
    expect(parseTimeRange("11:20 - 12:50 PM")).toEqual({ start: "11:20", end: "12:50" });
    expect(parseTimeRange("CSE 115-2")).toBeNull();
  });
  it("reads day names and university day codes", () => {
    expect(parseDays("Sunday & Tuesday")).toEqual([0, 2]);
    expect(parseDays("ST", true)).toEqual([0, 2]);
    expect(parseDays("RA", true)).toEqual([4, 6]);
    expect(parseDays("ST")).toEqual([]);
  });
  it("extracts fields from a cell without inventing missing ones", () => {
    const f = parseCellText("CSE 215 Data Structures Room: 512 Sec 3");
    expect(f).toMatchObject({ courseCode: "CSE 215", courseName: "Data Structures", room: "512", section: "3", faculty: "" });
    expect(parseCellText("MAT 120 Calculus (ABK)").faculty).toBe("ABK");
  });
  it("parses header-style tables", () => {
    const rows = parseGrids([[
      ["Course Code", "Course Title", "Section", "Day", "Time", "Room", "Faculty"],
      ["CSE 115", "Programming Language I", "4", "ST", "8:00 AM - 9:30 AM", "NAC 512", "Dr. Rahman"],
      ["ENG 102", "English Composition", "1", "Monday", "11:20 AM - 12:50 PM", "SAC 301", ""],
    ]], []);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ day: 0, start: "08:00", end: "09:30", courseCode: "CSE 115", room: "NAC 512", faculty: "Dr. Rahman", section: "4" });
    expect(rows.find(r => r.courseCode === "ENG 102")).toMatchObject({ day: 1, faculty: "" });
  });
  it("parses day × time-slot matrices and merges adjacent slots", () => {
    const rows = parseGrids([[
      ["Day", "8:00-9:30", "9:40-11:10", "11:20-12:50"],
      ["Sunday", "PHY 107 Room 201", "PHY 107 Room 201", ""],
      ["Monday", "", "MAT 120 Calculus", ""],
    ]], []);
    expect(rows).toEqual([
      expect.objectContaining({ day: 0, start: "08:00", end: "11:10", courseCode: "PHY 107", room: "201" }),
      expect.objectContaining({ day: 1, start: "09:40", end: "11:10", courseCode: "MAT 120", courseName: "Calculus" }),
    ]);
  });
  it("reads a real XLSX file, including merged day cells", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Day", "Start Time", "End Time", "Course Code", "Course Name", "Room", "Instructor"],
      ["Sunday", "08:00", "09:30", "CSE 115", "Programming I", "512", "Dr. Karim"],
      ["", "10:00", "11:30", "MAT 120", "Calculus", "", ""],
    ]);
    ws["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Routine");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([buf], "routine.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => buf });
    const { rows } = await extractFromFile(file);
    expect(rows).toEqual([
      expect.objectContaining({ day: 0, start: "08:00", end: "09:30", courseCode: "CSE 115", faculty: "Dr. Karim", room: "512" }),
      expect.objectContaining({ day: 0, start: "10:00", end: "11:30", courseCode: "MAT 120", faculty: "", room: "" }),
    ]);
  });
  it("reads day codes written inside the time column, including one-letter labs", () => {
    const rows = parseGrids([[
      ["Course", "Section", "Faculty", "Time", "Room"],
      ["CSE173", "5", "MSA", "ST 08:00 AM - 09:30 AM", "NAC511"],
      ["CSE173L", "5", "MSA", "R 08:00 AM - 11:10 AM", "LIB603"],
      ["ENG102", "12", "TBA", "MW 11:20 AM - 12:50 PM", "SAC302"],
      ["MAT120.3", "", "NbM", "SR 01:00 PM - 02:30 PM", "NAC 210"],
    ]], []);
    const by = (code: string) => rows.filter(r => r.courseCode === code);
    expect(by("CSE173").map(r => r.day)).toEqual([0, 2]);
    expect(by("CSE173")[0]).toMatchObject({ start: "08:00", end: "09:30", section: "5", faculty: "MSA", room: "NAC511" });
    expect(by("CSE173L")).toEqual([expect.objectContaining({ day: 4, start: "08:00", end: "11:10", room: "LIB603" })]);
    expect(by("ENG102").map(r => [r.day, r.faculty])).toEqual([[1, ""], [3, ""]]);
    expect(by("MAT120").map(r => r.day)).toEqual([0, 4]);
    expect(by("MAT120")[0]).toMatchObject({ start: "13:00", end: "14:30", section: "3", faculty: "NbM", room: "NAC 210" });
  });
  it("reads unlabeled rows: course, section, faculty initials, day code + time, room", () => {
    const rows = fromLines([
      "CSE173 5 MSA ST 08:00 AM - 09:30 AM NAC511",
      "CSE173L 5 R 08:00 AM-11:10 AM LIB603 MSA",
      "MAT120 Calculus 3 TR 9:40 AM - 11:10 AM NAC 210",
      fixOcr("ENG1O2 12 TBA MW 11:2O AM-12:5O PM SAC3O2"),
    ]);
    expect(rows.filter(r => r.courseCode === "CSE173")).toEqual([0, 2].map(day => expect.objectContaining({ day, start: "08:00", end: "09:30", section: "5", faculty: "MSA", room: "NAC511" })));
    expect(rows.find(r => r.courseCode === "CSE173L")).toMatchObject({ day: 4, end: "11:10", room: "LIB603", faculty: "MSA" });
    expect(rows.filter(r => r.courseCode === "MAT120").map(r => r.day)).toEqual([2, 4]);
    expect(rows.find(r => r.courseCode === "MAT120")).toMatchObject({ courseName: "Calculus", section: "3", room: "NAC 210", faculty: "" });
    expect(rows.filter(r => r.courseCode === "ENG102")).toEqual([1, 3].map(day => expect.objectContaining({ day, start: "11:20", end: "12:50", room: "SAC302", faculty: "", courseName: "" })));
  });
  it("parses headerless tables row by row", () => {
    const rows = parseGrids([[["CSE173", "5", "MSA", "ST 08:00 AM - 09:30 AM", "NAC511"], ["PHY108L", "2", "KMH", "A 02:40 PM - 05:50 PM", "PHY LAB"]]], []);
    expect(rows.map(r => [r.courseCode, r.day])).toEqual([["CSE173", 0], ["CSE173", 2], ["PHY108L", 6]]);
    expect(rows.find(r => r.courseCode === "PHY108L")).toMatchObject({ start: "14:40", end: "17:50", faculty: "KMH", section: "2" });
  });
  it("reads an advising slip: code, classroom, and every meeting, and skips dropped courses", () => {
    expect(parseTimeRange("3:10PM-4:40PM")).toEqual({ start: "15:10", end: "16:40" });
    const rows = parseGrids([[
      ["Course(s)", "Sec", "Cr", "Tuition", "Time-WeekDay", "Room", "Remarks"],
      ["ECO7101", "16", "3.00", "0.00", "TR 3:10PM-4:40PM", "AB3-702", "Dropped on Sep 21 2026"],
      ["ICE322", "1", "4.00", "22000.00", "MW 3:10PM-4:40PM", "AB1-101", ""],
      ["ICE322 Lab", "", "", "", "R 4:50PM-6:50PM", "435 (General Purpose Programming Lab)", ""],
      ["ICE439", "1", "3.00", "16500.00", "MW 4:50PM-6:20PM", "AB2-602", ""],
      ["ICE476", "5", "3.00", "16500.00", "SR 3:10PM-4:40PM", "AB2-602", ""],
      ["ICE476 Lab", "", "", "", "T 4:50PM-6:50PM", "638 (Artificial Intelligence Lab)", ""],
      ["ICE496A", "1", "1.00", "4400.00", "A 10:10AM-11:40AM", "Project", ""],
    ]], []);
    expect(rows.map(r => r.courseCode)).not.toContain("ECO7101");
    const by = (code: string, name = "") => rows.filter(r => r.courseCode === code && r.courseName === name);
    expect(by("ICE322").map(r => r.day)).toEqual([1, 3]);
    expect(by("ICE322")[0]).toMatchObject({ start: "15:10", end: "16:40", room: "AB1-101", section: "1", courseName: "" });
    expect(by("ICE322", "Lab")).toEqual([expect.objectContaining({ day: 4, start: "16:50", end: "18:50", room: "435 (General Purpose Programming Lab)", section: "1" })]);
    expect(by("ICE439").map(r => [r.day, r.room])).toEqual([[1, "AB2-602"], [3, "AB2-602"]]);
    expect(by("ICE476").map(r => r.day)).toEqual([0, 4]);
    expect(by("ICE476", "Lab")[0]).toMatchObject({ day: 2, start: "16:50", room: "638 (Artificial Intelligence Lab)", section: "5" });
    expect(by("ICE496A")[0]).toMatchObject({ day: 6, start: "10:10", end: "11:40", room: "Project", section: "1" });
  });
  it("rebuilds that slip from PDF word positions", () => {
    const at = (text: string, x: number, y: number) => ({ text, x, y });
    const grid = gridsFromPositioned([
      at("Course(s)", 45, 705), at("Sec", 140, 705), at("Cr", 199, 705), at("Tuition", 286, 705), at("Time-WeekDay", 328, 705), at("Room", 434, 705), at("Remarks", 517, 705),
      at("ECO7101", 51, 692), at("16", 144, 692), at("3.00", 197, 692), at("0.00", 304, 692), at("TR 3:10PM-4:40PM", 328, 692), at("AB3-702", 432, 692), at("Dropped on Sep 21 2026", 492, 692),
      at("9:08PM with 100.00%", 499, 683), at("refund", 527, 674),
      at("ICE322", 55, 661), at("1", 146, 661), at("4.00", 197, 661), at("22000.00", 286, 661), at("MW 3:10PM-4:40PM", 326, 661), at("AB1-101", 432, 661),
      at("ICE322 Lab", 48, 645), at("R 4:50PM-6:50PM", 330, 645), at("435 (General Purpose", 408, 645), at("Programming Lab)", 415, 636),
      at("ICE496A", 53, 569), at("1", 146, 569), at("1.00", 197, 569), at("4400.00", 290, 569), at("A 10:10AM-11:40AM", 326, 569), at("Project", 436, 569),
      at("Tuition Fee", 11, 550), at("59400.00", 278, 550),
    ]);
    const rows = parseGrids(grid, []);
    expect(rows.find(r => r.courseCode === "ECO7101")).toBeUndefined();
    expect(rows.find(r => r.courseCode === "ICE322" && r.courseName === "")).toMatchObject({ day: 1, room: "AB1-101", start: "15:10" });
    expect(rows.find(r => r.courseName === "Lab")).toMatchObject({ courseCode: "ICE322", day: 4, room: "435 (General Purpose Programming Lab)", section: "1" });
    expect(rows.find(r => r.courseCode === "ICE496A")).toMatchObject({ day: 6, room: "Project", start: "10:10", end: "11:40" });
  });
  it("parses OCR-style lines with day context", () => {
    const rows = fromLines(["Wednesday", "CSE 173 Discrete Math 2:40 - 4:10 Room 404", "Lunch"]);
    expect(rows).toEqual([expect.objectContaining({ day: 3, start: "14:40", end: "16:10", courseCode: "CSE 173", room: "404" })]);
  });
});

describe("every-day notes and journal", () => {
  const note: Note = {
    id: "n1", userId: "u", title: "Adhkar", category: "Personal", color: "plain", kind: "everyday", createdAt: "", updatedAt: "",
    blocks: [{ id: "a", type: "todo", text: "Morning" }, { id: "b", type: "todo", text: "Evening" }],
  };
  it("ticks belong to one day and keep that day's items", () => {
    let n = setTick(note, "2026-11-19", "a", true);
    n = setTick(n, "2026-11-19", "b", true);
    n = setTick(n, "2026-11-20", "a", true);
    expect([...doneOn(n, "2026-11-19")]).toEqual(["a", "b"]);
    expect([...doneOn(n, "2026-11-20")]).toEqual(["a"]);
    expect(doneOn(n, "2026-11-21").size).toBe(0);
    const renamed = syncToday({ ...n, blocks: [{ id: "a", type: "todo", text: "Fajr adhkar" }] }, "2026-11-20");
    expect(renamed.days?.["2026-11-20"]?.items).toEqual([{ id: "a", text: "Fajr adhkar", done: true }]);
    expect(renamed.days?.["2026-11-19"]?.items.map(i => i.text)).toEqual(["Morning", "Evening"]);
  });
  it("counts streaks of fully completed days and deletes single days", () => {
    let n = note;
    for (const d of ["2026-11-18", "2026-11-19"]) n = setTick(setTick(n, d, "a", true), d, "b", true);
    expect(streak(n, "2026-11-20")).toBe(2);
    expect(streak(deleteDay(n, "2026-11-18"), "2026-11-20")).toBe(1);
  });
  it("builds spreadsheet rows per note type", () => {
    const journal: Note = { ...note, id: "j", kind: "journal", journalDate: "2026-11-20", title: "Friday", blocks: [{ id: "p", type: "paragraph", text: "Good day" }] };
    const rows = notesWorkbookRows([setTick(note, "2026-11-20", "a", true), journal]);
    expect(rows.Journal[0]).toMatchObject({ Date: "2026-11-20", Entry: "Good day" });
    expect(rows["Every day"][0]).toMatchObject({ Date: "2026-11-20", Note: "Adhkar", Done: 1, Total: 2, "Completed %": 50 });
    expect(rows["Every day items"].map(r => r.Done)).toEqual(["Yes", "No"]);
    expect(rows.Notes).toEqual([]);
  });
});

describe("prayer times", () => {
  it("calculates five ordered prayers for Dhaka", () => {
    const t = prayerTimesFor(DEFAULT_PRAYER_SETTINGS, new Date("2026-11-19T06:00:00Z"));
    const ts = PRAYERS.map(p => t[p].getTime());
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    const dhuhr = t.Dhuhr.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
    expect(dhuhr >= "11:30" && dhuhr <= "12:00").toBe(true);
  });
  it("Hanafi Asr is later than standard Asr", () => {
    const at = new Date("2026-11-19T06:00:00Z");
    const hanafi = prayerTimesFor(DEFAULT_PRAYER_SETTINGS, at).Asr.getTime();
    const shafi = prayerTimesFor({ ...DEFAULT_PRAYER_SETTINGS, madhab: "shafi" }, at).Asr.getTime();
    expect(hanafi).toBeGreaterThan(shafi);
  });
  it("matches the Islamic Foundation Bangladesh timetable for Dhaka", () => {
    const clock = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
    const official = (settings: typeof DEFAULT_PRAYER_SETTINGS, day: string) => PRAYERS.map(p => clock(prayerTimesFor(settings, new Date(`${day}T06:00:00Z`))[p]));
    expect(official(DEFAULT_PRAYER_SETTINGS, "2026-11-20")).toEqual(["04:58", "11:48", "15:36", "17:15", "18:32"]);
    expect(official(DEFAULT_PRAYER_SETTINGS, "2026-06-04").slice(0, 2)).toEqual(["03:45", "12:00"]);
    expect(official({ ...DEFAULT_PRAYER_SETTINGS, timetable: "astronomical" }, "2026-11-20")[3]).toBe("17:11");
  });
});

const session: ClassSession = { id: "c1", userId: "u", routineId: null, courseName: "Physics", courseCode: "PHY 107", day: 4, start: "10:00", end: "11:30", room: "201", faculty: "", section: "" };

describe("class timer", () => {
  it("counts down, runs during class, and stops at the end", () => {
    expect(classState([session], {}, atTime("2026-11-19", "09:50").getTime())).toMatchObject({ kind: "upcoming", startsIn: 600_000 });
    expect(classState([session], {}, atTime("2026-11-19", "10:15").getTime())).toMatchObject({ kind: "active", elapsed: 900_000 });
    expect(classState([session], {}, atTime("2026-11-19", "11:31").getTime()).kind).toBe("upcoming");
  });
  it("supports manual end and manual start", () => {
    const key = occurrenceKey("c1", "2026-11-19");
    const ten15 = atTime("2026-11-19", "10:15").getTime();
    expect(classState([session], { [key]: { endedAt: ten15 - 1 } }, ten15).kind).not.toBe("active");
    const early = atTime("2026-11-19", "09:55").getTime();
    expect(classState([session], { [key]: { startedAt: early } }, early + 60_000)).toMatchObject({ kind: "active", manual: true, elapsed: 60_000 });
  });
});

describe("reminders", () => {
  const prefs: Preferences = {
    dark: true, categories: [], lifestyle: "", budget: { monthly: 0, categoryLimits: {} }, prayer: DEFAULT_PRAYER_SETTINGS,
    reminders: { enabled: true, tasks: true, classes: true, prayers: false, browser: false, defaultTaskMinutes: 10, classMinutes: 5 },
  };
  const from = atTime("2026-11-19", "09:00").getTime();
  const to = atTime("2026-11-19", "10:00").getTime();
  it("derives task and class reminders from scheduled timestamps", () => {
    const r = buildReminders({ tasks: [task()], sessions: [session], prefs }, from, from, to);
    expect(r.map(x => x.kind)).toEqual(["task", "class"]);
    expect(r[0]?.fireAt).toBe(atTime("2026-11-19", "09:50").getTime());
    expect(r[1]?.fireAt).toBe(atTime("2026-11-19", "09:55").getTime());
  });
  it("reschedules with a new id and cancels on completion", () => {
    const moved = buildReminders({ tasks: [task({ start: "09:45", end: "10:30" })], sessions: [], prefs }, from, from, to);
    const original = buildReminders({ tasks: [task()], sessions: [], prefs }, from, from, to);
    expect(moved[0]?.id).not.toBe(original[0]?.id);
    const done = task({ statusOverrides: { "2026-11-19": "completed" } });
    expect(buildReminders({ tasks: [done], sessions: [], prefs }, from, from, to)).toHaveLength(0);
  });
});

describe("budget", () => {
  const spend = (date: string, amount: number, category = "Food"): Expense => ({ id: `${date}${amount}${category}`, userId: "u", title: "x", amount, category, date });
  const budget = { monthly: 30_000, categoryLimits: { Food: 9_000 } };
  it("spreads what's left over the remaining days and flags an over-pace month", () => {
    // November has 30 days; on the 10th, 15,000 spent before today and 600 today.
    const list = [spend("2026-11-03", 15_000), spend("2026-11-10", 600), spend("2026-10-31", 99_999)];
    const s = budgetSummary(list, budget, "2026-11", "2026-11-10");
    expect(s.spent).toBe(15_600);
    expect(s.daysLeft).toBe(21);
    expect(s.dailyAllowance).toBeCloseTo(15_000 / 21);
    expect(s.safeToday).toBeCloseTo(15_000 / 21 - 600);
    expect(s.projected).toBeCloseTo(46_800);
    expect(s.status).toBe("warning");
    expect(budgetSummary([spend("2026-11-02", 31_000)], budget, "2026-11", "2026-11-10").status).toBe("over");
    expect(budgetSummary([spend("2026-11-02", 5_000)], budget, "2026-11", "2026-11-10").status).toBe("ok");
    expect(budgetSummary([], { monthly: 0, categoryLimits: {} }, "2026-11", "2026-11-10").status).toBe("unset");
  });
  it("warns once when a new expense crosses a category or monthly limit", () => {
    const before = [spend("2026-11-05", 8_500), spend("2026-11-06", 15_000, "Bills")];
    expect(limitWarnings(before, spend("2026-11-07", 1_000), budget)).toEqual([
      "Food is now ৳500 over its ৳9,000 limit.",
      "You’ve used 82% of this month’s budget.",
    ]);
    expect(limitWarnings([...before, spend("2026-11-07", 1_000)], spend("2026-11-08", 100), budget)).toEqual([]);
  });
  it("breaks spending down by category against limits", () => {
    const rows = categoryBreakdown([spend("2026-11-05", 9_500), spend("2026-11-05", 300, "Transport")], budget, "2026-11");
    expect(rows[0]).toMatchObject({ category: "Food", spent: 9_500, limit: 9_000, over: true });
    expect(rows[1]).toMatchObject({ category: "Transport", spent: 300, limit: 0, over: false });
  });
});
