/**
 * The file whose change made the dev server reload an app page, from a frame of Vite's HMR socket: a `full-reload`
 * for a module, or for `/index.html`, the app's page. Another HTML file's reload reaches only that page, and every other
 * frame reloads nothing: none for those. e2e/devices.ts voids a test whose page the dev server reloaded mid-test.
 */
export const devReload = (payload: string | Buffer): string | undefined => {
  if (typeof payload !== "string" || !payload.includes("full-reload")) return undefined
  let message: { readonly type?: unknown; readonly path?: unknown; readonly triggeredBy?: unknown }
  try {
    message = JSON.parse(payload)
  } catch {
    return undefined
  }
  if (message.type !== "full-reload") return undefined
  const path = typeof message.path === "string" ? message.path : undefined
  if (path !== undefined && path.endsWith(".html") && path !== "/index.html") return undefined
  return typeof message.triggeredBy === "string" ? message.triggeredBy : path ?? "*"
}
