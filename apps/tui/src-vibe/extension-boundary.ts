// C-1: declared catches native decoder/JSON defects. D-2: decode calls the plain panel decoder.
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

export const declaredImpl = (descriptor: Descriptor): Declared => {
  const owner = `repo:${descriptor.name}`
  const none: Declared = { owner, keys: [], status: false, problems: [] }
  if (descriptor.tui === undefined) return none
  try {
    const manifest = Schema.decodeUnknownSync(Manifest)(
      typeof descriptor.tui === "string" ? JSON.parse(descriptor.tui) : descriptor.tui
    )
    // A key without an action runs its owner. An agent's key starts it at once, its label the prompt.
    const own = (label: string): Action =>
      isAgent(descriptor)
        ? { kind: "agent", agent: descriptor.name, prompt: label }
        : { kind: "flow", flow: descriptor.name }
    const keys = (manifest.keys ?? []).map((key) =>
      Schema.decodeUnknownSync(Key)({
        id: `${owner}/${key.key}`,
        key: key.key,
        label: key.label,
        context: key.context ?? "global",
        action: key.action ?? own(key.label)
      })
    )
    return { owner, keys, status: flag(manifest.status), problems: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error)
    return { ...none, problems: [`${descriptor.name}: ${message}`] }
  }
}

