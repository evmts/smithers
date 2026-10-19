// A-1: synchronous decoder throws on invalid input.
import { Schema } from "effect"
import * as Panels from "./panels.vibe"
import { Contribution, Manifest, Key, isAgent, type Action, type Descriptor, type Declared } from "./extension.vibe"
const flag = (value: boolean | "true" | "false" | undefined): boolean => value === true || value === "true"
export const decodeImpl = (value: unknown): Contribution => {
  const input = typeof value === "object" && value !== null && !("kind" in value)
    ? { kind: "panel", placement: "tab", panel: value }
    : typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "panel" &&
        !("placement" in value)
    ? { ...value, placement: "tab" }
    : value
  const contribution = Schema.decodeUnknownSync(Contribution)(input)
  return contribution.kind === "panel" ? { ...contribution, panel: Panels.decode(contribution.panel) } : contribution
}

