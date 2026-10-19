// A-1: decoder is synchronous and intentionally throws.
import { Schema } from "effect"
import { Panel } from "./panels.vibe"
export const decodeImpl = (value: unknown): Panel => {
  const panel = Schema.decodeUnknownSync(Panel)(value)
  if (JSON.stringify(panel).length > 1_000_000) throw new Error("Panel exceeds 1 MB")
  if (new Set(panel.rows.map((row) => row.id)).size !== panel.rows.length) throw new Error("Row ids must be unique")
  return panel
}

