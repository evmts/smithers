import type { Journey } from "./journey.ts"
import { matchRoute } from "./route.ts"
import { readRoutes } from "./routes/reads.ts"
import { defaultWorld } from "./worlds/default.ts"

/** Bindings read the same typed route handlers as the browser transport. */
export const readWorld = async (definition: Journey, read: string): Promise<unknown> => {
  if (definition.world.base !== "default") throw new Error("World not implemented")
  const [method, path] = read.split(" ")
  if (method !== "GET" || !path?.startsWith("/api/")) throw new Error("Read-only world binding required")
  const url = new URL(path, "http://spec.test")
  const world = defaultWorld(new URLSearchParams(definition.world.variant))
  for (const route of readRoutes) {
    const params = matchRoute(route.path, url.pathname)
    if (route.method !== method || !params) continue
    const response = route.handle({ url, params }, world)
    if ((response.status ?? 200) >= 400) throw new Error(`World binding HTTP ${response.status}`)
    return route.schema.parse(response.body)
  }
  throw new Error(`Missing world binding: ${read}`)
}
