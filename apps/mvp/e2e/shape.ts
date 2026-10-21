import { type APIRequestContext, expect } from "@playwright/test"

// The `messages` rows a signed-in person reads, through ChatApi's shape proxy, as their devices read them
// (worker/Chat.ts). The local-first tests compare them with what each device shows; the spend guard (e2e/spend.ts)
// adds up their answers' tokens.

/** A row of Postgres `messages` as Electric's shape serves it (snake_case columns). */
export type Row = {
  id: string
  role: string
  text: string
  status: string
  question_id: string | null
  failure: string | null
  position: string
  input_tokens?: string | null
  output_tokens?: string | null
  created_at?: string
}

type ShapeMessage = {
  key?: string
  value?: Partial<Row>
  headers: { operation?: "insert" | "update" | "delete"; control?: string }
}

// Every row of Postgres `messages`, in `position` order, read the way devices read them: Electric's shape through
// ChatApi's proxy, from the start of its log until it is up to date.
export const allServerRows = async (request: APIRequestContext): Promise<Array<Row>> => {
  const rows = new Map<string, Row>()
  let query = "offset=-1"
  for (let page = 0; page < 1_000; page++) {
    const response = await request.get(`/api/shapes/messages?${query}`)
    expect(response.status(), "ChatApi serves the messages shape").toBe(200)
    for (const message of (await response.json()) as Array<ShapeMessage>) {
      const key = message.key ?? message.value?.id
      if (key === undefined) continue
      if (message.headers.operation === "delete") rows.delete(key)
      else if (message.headers.operation !== undefined) rows.set(key, { ...rows.get(key), ...message.value } as Row)
    }
    const headers = response.headers()
    if ("electric-up-to-date" in headers) break
    query = `offset=${headers["electric-offset"]}&handle=${headers["electric-handle"]}`
  }
  return [...rows.values()].sort((left, right) => Number(left.position) - Number(right.position))
}
