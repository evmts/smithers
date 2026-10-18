import { defaultWorld } from "./worlds/default"
import { readRoutes } from "./routes/reads"
import { matchRoute } from "./route"
import type { Journey } from "./journey"
/** Bind to the same typed world routes that the in-page transport serves. */
export const readWorld = async (definition: Journey, read: string): Promise<unknown> => {
  if (definition.world.base !== "default") throw new Error("world arrives at M")
  const world = defaultWorld(new URLSearchParams(definition.world.variant))
  const [method, path] = read.split(" ")
  const url = new URL(path!, "http://spec.invalid")
  for (const route of readRoutes) {
    const params = matchRoute(route.path, url.pathname)
    if (route.method !== method || !params) continue
    const response = route.handle({ url, params }, world)
    if (response.status && response.status >= 400) throw new Error(`World binding: HTTP ${response.status} ${path}`)
    return route.schema.parse(response.body)
  }
  throw new Error(`Unknown world binding: ${read}`)
}
