import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runRoutineExtraction } from "./ai/routine-extract.server";

const schema = z.object({
  fileName: z.string().max(200),
  mimeType: z.enum(["image/png", "image/jpeg", "text/plain"]),
  data: z.string().min(1).max(14_000_000),
});

export const extractRoutineWithAI = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, classes: await runRoutineExtraction(data) };
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      const msg =
        err.statusCode === 429 ? "The AI is busy right now. Please try again in a minute."
        : err.statusCode === 402 ? "AI credits have run out. You can still edit the extracted rows by hand."
        : err.message || "Something went wrong reading this routine.";
      return { ok: false as const, error: msg };
    }
  });
