import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export type ExtractInput = {
  fileName: string;
  mimeType: string;
  /** base64 for images, extracted plain text for documents and spreadsheets */
  data: string;
};

const row = z.object({
  courseName: z.string().catch(""),
  courseCode: z.string().catch(""),
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().catch(""),
  faculty: z.string().catch(""),
  section: z.string().catch(""),
});
export type AiExtractedClass = z.infer<typeof row>;

const INSTRUCTIONS = `You extract weekly university class schedules into structured data.
Return EVERY class occurrence exactly as written. One entry per (class, weekday) pair — a class held on Sunday and Tuesday becomes two entries.
Rules:
- day: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.
- Day codes are single uppercase letters, usually written right before the time: S=Sunday, M=Monday, T=Tuesday, W=Wednesday, R=Thursday, A=Saturday, F=Friday. Combined codes list each day: "ST" = Sunday+Tuesday, "SR" = Sunday+Thursday, "MW" = Monday+Wednesday, "TR" = Tuesday+Thursday. Labs usually have one letter ("R 08:00 AM - 11:10 AM" = Thursday only).
- room: the room as written (e.g. "NAC511", "SAC 302"). faculty: the name or initials as written (e.g. "MSA"); "TBA" means unknown, so use "".
- start/end: 24-hour "HH:mm".
- NEVER invent or guess missing information. If a faculty name, room, section, course code or course name is not visible, use an empty string "".
- Do not include breaks, lunch, or non-class rows.
Reply with ONLY JSON: {"classes":[{"courseName":"","courseCode":"","day":0,"start":"08:00","end":"09:30","room":"","faculty":"","section":""}]}`;

export async function runRoutineExtraction(input: ExtractInput): Promise<AiExtractedClass[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI reading is not configured on this server.");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const filePart = input.mimeType.startsWith("image/")
    ? ({ type: "image", image: new URL(`data:${input.mimeType};base64,${input.data}`) } as const)
    : ({ type: "text", text: `Text extracted from the schedule:\n${input.data}` } as const);

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system: INSTRUCTIONS,
    messages: [{ role: "user", content: [{ type: "text", text: `Class routine file: ${input.fileName}` }, filePart] }],
    providerOptions: { openai: { store: false, reasoningEffort: "low" } },
  });
  const text = await result.text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI couldn't find a class schedule in this file.");
  const parsed = JSON.parse(match[0]) as { classes?: unknown[] };
  return (parsed.classes ?? []).flatMap(c => {
    const r = row.safeParse(c);
    return r.success ? [r.data] : [];
  });
}
