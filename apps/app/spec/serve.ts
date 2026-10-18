import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { resolve, extname, sep } from "node:path"
/** Serve the already-built spec artifact, including SPA navigation fallback. */
export const serve = async (root: string): Promise<{ readonly origin: string; readonly close: () => Promise<void> }> => {
  const base = resolve(root)
  await stat(resolve(base, "index.html"))
  const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" }
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", "connect-src 'self'")
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return }
    try {
      const pathname = decodeURIComponent(new URL(req.url!, "http://localhost").pathname)
      const file = resolve(base, `.${pathname}`)
      if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return }
      let body: Buffer
      let extension = extname(file)
      try { body = await readFile(file) } catch {
        if (extension || pathname.startsWith("/api/")) { res.writeHead(404).end(); return }
        body = await readFile(resolve(base, "index.html")); extension = ".html"
      }
      res.writeHead(200, { "Content-Type": mime[extension] ?? "application/octet-stream" })
      res.end(req.method === "HEAD" ? undefined : body)
    } catch { res.writeHead(500).end() }
  })
  // Lane ports; retry collisions without reusing somebody else's server.
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((done, reject) => {
        const error = (e: Error) => { server.off("listening", listening); reject(e) }
        const listening = () => { server.off("error", error); done() }
        server.once("error", error).once("listening", listening).listen(49400 + Math.floor(Math.random() * 2000), "127.0.0.1")
      })
      break
    } catch (error) { if (attempt >= 10 || (error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error }
  }
  const address = server.address() as import("node:net").AddressInfo
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((done, reject) => server.close(error => error ? reject(error) : done())) }
}
