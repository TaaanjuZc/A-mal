import { describe, expect, it } from "vitest";
import { asUuid, taskFromRow, taskToRow } from "@/lib/daywell/records";
import type { Task } from "@/lib/daywell/types";

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111", userId: "u", title: "Read", description: "", category: "Study",
  date: "2026-11-21", start: "09:00", end: "10:00", reminderMinutes: null, recurrence: "none", recurrenceUntil: null,
  statusOverrides: {}, createdAt: "2026-11-21T00:00:00.000Z", updatedAt: "2026-11-21T00:00:00.000Z",
};

describe("account records", () => {
  it("keeps a real id and rebuilds the same task from a row", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    const row = await taskToRow(userId, task);
    expect(row.id).toBe(task.id);
    expect(row.user_id).toBe(userId);
    expect(taskFromRow(row)).toMatchObject({ title: "Read", date: "2026-11-21", start: "09:00", reminderMinutes: null });
  });
  it("turns an old id into the same uuid every time", async () => {
    const first = await asUuid("local-1");
    expect(await asUuid("local-1")).toBe(first);
    expect(first).not.toBe(await asUuid("local-2"));
  });
});
