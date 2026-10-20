import { MarkdownFlow } from "@smthrs/registry"
import { Descriptor } from "@smthrs/registry"
import { Option } from "effect"
import { forbidden } from "./callable"
import {
  FLOW_MODEL_ROLE,
  MAX_CALLS,
  MAX_DESCRIPTION_CHARS,
  MAX_SKILL_BYTES,
  NAME_PATTERN,
  RESERVED_NAMES,
  SKILL_PATH,
} from "./contract"
import type { DraftCheck } from "./schema"

// A person's flow is a `SKILL.md` (decision 0014 §1, the Agent Skills format): frontmatter naming it, describing it and
// listing the app flows it may call, then the instructions an agent follows. `renderSkill` writes one from a draft's
// fields, declaring no capabilities of its own; `readSkill` reads one through @smthrs/registry's `MarkdownFlow`, the parser the registry discovers every
// markdown flow with; `checkSkill` runs decision 0014's static checks over it. Only an engine's host imports this
// module: the tab shows a draft's checks from its row.

/** What a `SKILL.md` declares. */
export interface Skill {
  readonly name: string
  readonly description: string
  readonly flows: ReadonlyArray<string>
  readonly instructions: string
}

/** A YAML scalar for `text`: a JSON string, which YAML reads as a double-quoted scalar. */
const scalar = (text: string) => JSON.stringify(text)

/** `skill` as a `SKILL.md`. */
export const renderSkill = (skill: Skill): string =>
  [
    "---",
    `name: ${skill.name}`,
    `description: ${scalar(skill.description)}`,
    // Its own authority is none: it acts only through the flows it lists, under its person's grants.
    "capabilities: []",
    ...(skill.flows.length === 0 ? [] : ["flows:", ...skill.flows.map((flow) => `  - ${scalar(flow)}`)]),
    "---",
    "",
    skill.instructions.trim(),
    "",
  ].join("\n")

/** A `SKILL.md` as the registry reads it: what it declares, its model if it names one, and what it warned about. */
export interface Read {
  readonly skill: Skill | undefined
  readonly model: string | ReadonlyArray<string> | undefined
  readonly placement: string | undefined
  readonly warnings: ReadonlyArray<string>
}

/** Reads `text`, a `SKILL.md` in a directory named `name`. */
export const readSkill = (text: string, name: string): Read => {
  const read = MarkdownFlow.fromMarkdown({
    text,
    path: SKILL_PATH,
    baseDirectory: ".",
    naming: "frontmatter",
    name: Option.none(),
    dirBasename: name,
    provenance: new Descriptor.Provenance({ source: "person", root: "." }),
  })
  const warnings = read.warnings.map((warning) => warning.code)
  if (Option.isNone(read.descriptor)) return { skill: undefined, model: undefined, placement: undefined, warnings }
  const descriptor = read.descriptor.value
  return {
    skill: {
      name: descriptor.name,
      description: descriptor.description,
      flows: descriptor.flows,
      instructions: MarkdownFlow.loadBody(text, ".").text.trim(),
    },
    model: Option.getOrUndefined(descriptor.model),
    placement: Option.getOrUndefined(descriptor.placement),
    warnings,
  }
}

/**
 * Decision 0014's static checks over `text`, a prompt flow's `SKILL.md` that should be named `name`, whose `flows:` may
 * name only `allowed` flows. Each check passes or names why it failed, by a code, never a quote of the file:
 * - `parses`: the registry reads it without a warning;
 * - `name`: the pattern, outside the app's names, and the name it should have;
 * - `description`: 1 to 1,024 characters;
 * - `calls`: at most `MAX_CALLS`, each one `allowed`, never a `flow/` or `run/` act;
 * - `model`: absent, or the endpoint's role `agent`, never a provider's model id;
 * - `size`: 64 KiB at most.
 */
export const checkSkill = (text: string, name: string, allowed: ReadonlyArray<string>): ReadonlyArray<DraftCheck> => {
  const read = readSkill(text, name)
  const skill = read.skill
  const check = (id: DraftCheck["check"], failure: string | undefined): DraftCheck =>
    failure === undefined ? { check: id, ok: true } : { check: id, ok: false, code: failure }
  const declaredName = skill?.name
  return [
    check("parses", read.warnings.length === 0 ? undefined : read.warnings[0]),
    check(
      "name",
      declaredName === undefined || !NAME_PATTERN.test(declaredName)
        ? "pattern"
        : (RESERVED_NAMES as ReadonlyArray<string>).includes(declaredName)
        ? "reserved"
        : declaredName !== name
        ? "mismatch"
        : undefined,
    ),
    check(
      "description",
      skill === undefined || skill.description.trim() === "" || [...skill.description].length > MAX_DESCRIPTION_CHARS
        ? "length"
        : undefined,
    ),
    check(
      "calls",
      skill === undefined
        ? "unread"
        : skill.flows.length > MAX_CALLS
        ? "too_many"
        : skill.flows.some(forbidden)
        ? "forbidden"
        : skill.flows.some((flow) => !allowed.includes(flow))
        ? "unknown"
        : undefined,
    ),
    check(
      "model",
      read.model === undefined || read.model === FLOW_MODEL_ROLE ? read.placement === undefined ? undefined : "placement" : "model",
    ),
    check("size", new TextEncoder().encode(text).length > MAX_SKILL_BYTES ? "too_large" : undefined),
  ]
}

/** Whether every check passed. */
export const passes = (checks: ReadonlyArray<DraftCheck>): boolean => checks.every((check) => check.ok)
