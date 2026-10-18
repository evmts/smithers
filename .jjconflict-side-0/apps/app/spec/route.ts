import type { z } from "zod"
import type { World } from "./world"
export interface FixtureRequest { readonly url: URL; readonly params: Readonly<Record<string, string>> }
export interface FixtureResponse { readonly body: unknown; readonly status?: number }
export interface FixtureRoute {
  readonly method: string
  readonly path: string
  readonly schema: z.ZodType
  readonly handle: (req: FixtureRequest, w: World) => FixtureResponse
  readonly transition?: (req: FixtureRequest, w: World) => World
  /** Bootstrap, identity and repository addressing establish the read target. */
  readonly control?: boolean
}
export const route = (value: FixtureRoute): FixtureRoute => value
export const matchRoute = (pattern: string, path: string): Readonly<Record<string, string>> | undefined => {
  try {
  const expected = pattern.split("/")
  const actual = path.split("/")
  const params: Record<string, string> = {}
  for (let i = 0; i < expected.length; i++) {
    const part = expected[i]!
    if (part.startsWith("*")) { params[part.slice(1)] = actual.slice(i).map(decodeURIComponent).join("/"); return params }
    if (actual[i] === undefined) return undefined
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(actual[i]!)
    else if (part !== actual[i]) return undefined
  }
  return actual.length === expected.length ? params : undefined
  } catch { return undefined }
}
