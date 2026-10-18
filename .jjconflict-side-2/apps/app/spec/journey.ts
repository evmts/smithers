import { z } from "zod"

/** Accessible element, deliberately independent of execution mode. */
export interface Element {
  /** Zero-based position among matching accessible elements. */
  readonly nth?: number
  readonly within?: Element
  readonly role: string
  readonly name?: string
  readonly editable?: boolean
  readonly href?: string
  readonly level?: number
}
export type Assertion =
  | { readonly see: Element; readonly count?: number; readonly text?: string | { readonly pattern: string } }
  | { readonly text: string; readonly source?: "html" }
  | { readonly absent: string | { readonly pattern: string } }
  | { readonly url: string | { readonly startsWith: string; readonly includes?: ReadonlyArray<string>; readonly matches?: string; readonly absent?: ReadonlyArray<string> }; readonly on?: Element; readonly status?: number }
  | { readonly sent: string }
  | { readonly shape: string; readonly schema: string }
  | { readonly fuzzy: { readonly view: string }; readonly means: string }
  | { readonly rubric: string; readonly on: { readonly view: string } }
export interface Step {
  readonly volatile?: { readonly text: ReadonlyArray<string>; readonly selectors?: ReadonlyArray<string> }
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly caption: string
  readonly spec?: string
  readonly go?: string
  readonly click?: Element
  readonly type?: { readonly into: Element; readonly text: string }
  readonly say?: string
  readonly actor?: string
  readonly expect: ReadonlyArray<Assertion>
}
export interface Journey {
  readonly id: string
  readonly site: string
  readonly spec: string
  readonly lifecycle?: "evergreen"
  readonly world: { readonly base: string; readonly variant?: Readonly<Record<string, string>> }
  readonly live: { readonly skip: string } | { readonly target: string; readonly subject?: Readonly<Record<string, string>> }
  readonly bind?: Readonly<Record<string, { readonly read: string; readonly pick: string }>>
  readonly steps: ReadonlyArray<Step>
  readonly go?: string
  readonly expect?: ReadonlyArray<Assertion>
  readonly judge?: { readonly agent: string }
}
const elementSchema: z.ZodType<Element> = z.lazy(() => z.strictObject({ nth: z.number().int().nonnegative().optional(), within: elementSchema.optional(), role: z.string().min(1), href: z.string().optional(), editable: z.boolean().optional(), name: z.string().optional(), level: z.number().int().positive().optional() }))
const assertionSchema = z.union([
  z.strictObject({ see: elementSchema, count: z.number().int().nonnegative().optional(), text: z.union([z.string(), z.strictObject({ pattern: z.string().min(1).refine(value => { try { new RegExp(value); return true } catch { return false } }, "invalid pattern") })]).optional() }),
  z.strictObject({ text: z.string(), source: z.literal("html").optional() }), z.strictObject({ absent: z.union([z.string().min(1), z.strictObject({ pattern: z.string().min(1).refine(value => { try { new RegExp(value); return true } catch { return false } }, "invalid pattern") })]) }),
  z.strictObject({ url: z.union([z.string(), z.strictObject({ startsWith: z.string(), includes: z.array(z.string()).optional(), matches: z.string().optional(), absent: z.array(z.string()).optional() })]), on: elementSchema.optional(), status: z.number().int().min(100).max(599).optional() }),
  z.strictObject({ sent: z.string().regex(/^GET \//) }),
  z.strictObject({ shape: z.string().regex(/^GET \//), schema: z.string().min(1) }),
  z.strictObject({ fuzzy: z.strictObject({ view: z.string() }), means: z.string() }),
  z.strictObject({ rubric: z.string(), on: z.strictObject({ view: z.string() }) })
])
const stepSchema = z.strictObject({
  volatile: z.strictObject({ text: z.array(z.string().min(1)), selectors: z.array(z.string().min(1)).optional() }).optional(),
  viewport: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  caption: z.string().min(1), spec: z.string().min(1).optional(), go: z.string().optional(), click: elementSchema.optional(),
  type: z.strictObject({ into: elementSchema, text: z.string() }).optional(), say: z.string().optional(), actor: z.string().optional(), expect: z.array(assertionSchema)
}).refine(step => [step.go, step.click, step.type, step.say].filter(x => x !== undefined).length <= 1, "one verb only")
const journeySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/), site: z.string().min(1), spec: z.string().min(1), lifecycle: z.literal("evergreen").optional(),
  world: z.strictObject({ base: z.string().min(1), variant: z.record(z.string(), z.string()).optional() }),
  live: z.union([z.strictObject({ skip: z.string().min(1) }), z.strictObject({ target: z.string().min(1), subject: z.record(z.string(), z.string()).optional() })]),
  bind: z.record(z.string(), z.strictObject({ read: z.string().regex(/^GET \//), pick: z.string().min(1) })).optional(),
  steps: z.array(stepSchema), go: z.string().optional(), expect: z.array(assertionSchema).optional(), judge: z.strictObject({ agent: z.string() }).optional()
}).refine(value => value.steps.length > 0 || value.go !== undefined && value.expect !== undefined, "state requires go and expect")
/** Validate imported data before any browser or network activity. */
export const journey = (value: Journey): Journey => journeySchema.parse(value)
/** A state uses the same player, without gestures. */
export const state = (value: Omit<Journey, "steps" | "live"> & { readonly live?: Journey["live"]; readonly go: string; readonly expect: ReadonlyArray<Assertion> }): Journey =>
  journey({ ...value, live: value.live ?? { skip: "state has no live target" }, steps: [] })

export const interpolate = (text: string, bindings: Readonly<Record<string, string>>): string =>
  text.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
    const value = bindings[key]
    if (value === undefined) throw new Error(`Missing binding: ${key}`)
    return value
  })

/** Expand data values rather than serialized JSON, preserving quotes and newlines. */
export const interpolateData = (value: unknown, bindings: Readonly<Record<string, string>>): unknown => {
  if (typeof value === "string") return interpolate(value, bindings)
  if (Array.isArray(value)) return value.map(item => interpolateData(item, bindings))
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateData(item, bindings)]))
  return value
}
