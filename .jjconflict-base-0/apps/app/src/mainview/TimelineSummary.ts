import { z } from "zod"

const Pair = z.object({ v: z.literal(2), prompt: z.string().min(1), answer: z.string().min(1) })

/** Versioned pairs share the existing summary field; historical plain answers remain readable. */
export const entrySummary = (value: string | undefined, kind: "prompt" | "answer"): string | undefined => {
  if (!value?.trim()) return undefined
  try {
    const parsed = Pair.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data[kind] : undefined
  } catch {
    return kind === "answer" ? value : undefined
  }
}

/** Pending summaries report only recorded state, never the transcript or presumed success. */
export const replyLabel = (state: string): string => state === "accepted" ? "Waiting for reply"
  : state === "running" ? "Working" : state === "failed" ? "Reply failed"
  : state === "cancelled" ? "Reply stopped" : state === "uncertain" ? "Reply interrupted" : "Reply completed"
