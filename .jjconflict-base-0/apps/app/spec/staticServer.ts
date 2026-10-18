import { createServer } from "node:http"
import { readFile, realpath } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"

/** Plain static host: backend traffic is recorded and refused, never answered by a fixture. */
export const staticServer = async (root: string) => {
  const escapes: string[] = []
  const base = await realpath(root)
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", "connect-src 'self'")
    const path = new URL(req.url ?? "/", "http://localhost").pathname
    if (path.startsWith("/api/") || path === "/live" || req.headers.upgrade?.toLowerCase() === "websocket") {
      escapes.push(`${req.method} ${path}`)
      res.writeHead(599).end("Escaped spec transport")
      return
    }
    try {
      let file = resolve(base, `.${decodeURIComponent(path)}`)
      if (!file.startsWith(base + sep)) file = resolve(base, "index.html")
      try { file = await realpath(file) } catch { file = resolve(base, "index.html") }
      if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return }
      const data = await readFile(file)
      res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" } as Record<string, string>)[extname(file)] ?? "application/octet-stream")
      res.end(data)
    } catch { res.writeHead(404).end() }
  })
  server.on("upgrade", (req, socket) => {
    escapes.push(`WS ${req.url}`)
    socket.end("HTTP/1.1 599 Escaped spec transport\r\nConnection: close\r\n\r\n")
  })
  const port = 49400 + Math.floor(Math.random() * 2000)
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", done) })
  return { escapes, origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())) }
}
