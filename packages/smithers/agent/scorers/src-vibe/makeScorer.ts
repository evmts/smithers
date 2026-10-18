// A-1, B-4, C-1, D-2: synchronous declaration validation and sibling digest API.
import * as Digest from "@smthrs/core/Digest"
import * as Schema from "effect/Schema"
import * as Json from "./internal/json.vibe"
import { ScorerError } from "./ScorerError.vibe"
import { Input, Result, type MakeOptions, type Scorer } from "./Scorer.vibe"
const declaration = (message: string, cause?: unknown): ScorerError =>
  new ScorerError({
    code: "invalid_declaration",
    message,
    ...(cause === undefined ? {} : { cause })
  })

export const makeImpl = <E = never>(options: MakeOptions<E>): Scorer<E> => {
  for (const key of ["body", "model", "flows"] as const) {
    if (key in options) {
      throw declaration(`A scorer must not declare ${key}; use score as its only implementation`)
    }
  }
  const { config, id, score, version, ...rest } = options
  if (typeof id !== "string") throw declaration("A scorer id must be a string")
  if (typeof version !== "string") throw declaration("A scorer version must be a string")
  if (id.trim().length === 0) throw declaration("A scorer id must not be empty")
  if (version.trim().length === 0) throw declaration("A scorer version must not be empty")
  let lossy: string | undefined
  try {
    lossy = config === undefined ? undefined : Json.lossyPath(config, "config")
  } catch (cause) {
    throw declaration("A scorer configuration could not be inspected", cause)
  }
  if (lossy !== undefined) {
    throw declaration(`A scorer configuration must be representable as canonical JSON: ${lossy}`)
  }
  let scorerKey: string
  try {
    scorerKey = Digest.digest(Digest.canonical({ id, version, config: config ?? null }))
  } catch (cause) {
    throw declaration("A scorer configuration could not be canonicalized", cause)
  }
  // A scorer that named nothing is declared under its own `id`. A flow needs a
  // name to be addressed by, `id` is already the stable module-owned identity
  // this scorer is known by, and an anonymous declaration would otherwise have
  // to be given one somewhere that does not know what the scorer is.
  const flow = {
    ...rest,
    name: rest.name ?? id,
    description: rest.description,
    input: Input,
    output: Result,
    error: Schema.Never,
    capabilities: [...new Set(rest.capabilities ?? [])].sort(),
    effects: rest.effects
  }
  return Object.assign(flow, { scorerKey, score })
}

