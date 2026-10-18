import { constants } from "node:fs"
import { chmod, mkdir, open, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { homedir, networkInterfaces } from "node:os"
import { dirname, extname, resolve, sep } from "node:path"
import { timingSafeEqual, randomBytes } from "node:crypto"
import { z } from "zod"
import { catalog } from "./player/catalog"
import { labelEvidence } from "./labelEvidence"
import { agreementReports } from "./agreementReports"

const labelInput = z.strictObject({
  journey: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/), step: z.number().int().nonnegative(),
  mode: z.enum(["mock", "live"]), revision: z.string().min(1), thumb: z.enum(["up", "down"]),
  assertions: z.array(z.number().int().nonnegative()).max(100), note: z.string().trim().min(1).max(4000).optional()
}).refine(label => label.thumb === "up" || label.note || label.assertions.length, "A down thumb needs a note or assertion")

const privateAddress = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
const sameToken = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const within = (root: string, path: string) => path.startsWith(root + sep)
const noCheckout = async (path: string) => {
  let directory = path
  for (;;) {
    if (await Bun.file(resolve(directory, ".git")).exists() || await stat(resolve(directory, ".jj")).then(() => true, () => false) || await stat(resolve(directory, ".git")).then(() => true, () => false)) throw new Error("Labels must be outside a repository checkout")
    const parent = dirname(directory)
    if (parent === directory) return
    directory = parent
  }
}
export interface HostOptions {
  readonly port?: number
  readonly hostname?: string
  readonly lan?: boolean
  readonly local?: boolean
  readonly owner?: string
  readonly tokenFile?: string
  readonly resultsDirectory?: string
  readonly labelsDirectory?: string
  readonly dist?: string
  readonly policyPath?: string
}
/** Private read host; only authenticated people append labels. Never forwards API calls. */
export const startHost = async (options: HostOptions = {}) => {
  const lan = options.lan ?? process.env.SPEC_HOST_LAN === "1"
  const local = options.local ?? process.env.SPEC_HOST_LOCAL === "1"
  const hostname = options.hostname ?? (lan ? Object.values(networkInterfaces()).flat().find(address => address?.family === "IPv4" && !address.internal && privateAddress(address.address))?.address : "127.0.0.1")
  if (!hostname || (lan ? !privateAddress(hostname) && !(local && hostname === "127.0.0.1") : hostname !== "127.0.0.1")) throw new Error("Host requires loopback, or a private LAN IPv4 address in LAN mode")
  const resultsDirectory = await realpath(options.resultsDirectory ?? process.env.SPEC_RESULTS_DIR ?? resolve(homedir(), "smithers-spec/results"))
  let labelsDirectory = resolve(options.labelsDirectory ?? process.env.SPEC_LABELS_DIR ?? resolve(homedir(), "smithers-spec/labels"))
  await mkdir(labelsDirectory, { recursive: true, mode: 0o700 })
  labelsDirectory = await realpath(labelsDirectory)
  await noCheckout(labelsDirectory)
  const tokenFile = options.tokenFile ?? resolve(homedir(), "smithers-spec/host-token")
  let token = ""
  if (lan) {
    await mkdir(dirname(tokenFile), { recursive: true, mode: 0o700 })
    try { await writeFile(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    await chmod(tokenFile, 0o600)
    token = (await readFile(tokenFile, "utf8")).trim()
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid host token")
  }
  const dist = resolve(options.dist ?? resolve(import.meta.dirname, "../dist-spec"))
  const bundle = await Bun.build({ entrypoints: [resolve(import.meta.dirname, "player/client.ts")], target: "browser", minify: true })
  if (!bundle.success) throw new Error(bundle.logs.join("\n"))
  const script = await bundle.outputs[0]!.text()
  const screenshotPaths = new Map<string, string>()
  const data = async () => {
    const value = await catalog(resultsDirectory)
    screenshotPaths.clear()
    for (const run of value.runs) for (const [step, receipt] of run.steps.entries()) {
      const key = `${run.journey}:${run.mode}:${step}`
      try {
        const path = await realpath(resolve(resultsDirectory, receipt.screenshot))
        if (within(resultsDirectory, path) && extname(path) === ".png") screenshotPaths.set(key, path)
      } catch { /* A missing capture stays missing. */ }
    }
    return value
  }
  const countLabels = async () => {
    const counts: Record<string, { up: number; down: number }> = {}
    for await (const file of new Bun.Glob("*.jsonl").scan(labelsDirectory)) {
      for (const line of (await readFile(resolve(labelsDirectory, file), "utf8")).split("\n").filter(Boolean)) {
        try {
          const label = JSON.parse(line) as { journey: string; thumb: "up" | "down" }
          if (typeof label.journey !== "string" || !["up", "down"].includes(label.thumb)) continue
          const count = counts[label.journey] ??= { up: 0, down: 0 }
          count[label.thumb]++
        } catch { /* An incomplete external line cannot hide intact labels. */ }
      }
    }
    return counts
  }
  const mockRevision = async () => { const stamp = await Bun.file(resolve(dist, "__build.json")).json().catch(() => null) as { gitSha?: unknown } | null; return typeof stamp?.gitSha === "string" ? stamp.gitSha : null }
  const reports = () => agreementReports(options.policyPath ?? resolve(import.meta.dirname, "../../../.smithers/factory.json"), labelsDirectory, options.owner ?? process.env.SPEC_HOST_OWNER ?? "will").catch(() => null)
  let writes = Promise.resolve()
  const server = Bun.serve({
    hostname, port: options.port ?? Number(process.env.SPEC_HOST_PORT ?? 4790), maxRequestBodySize: 32_768,
    async fetch(request) {
      const url = new URL(request.url)
      const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }
      const reply = (body: BodyInit | null, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { ...headers, ...extra } })
      const json = (body: unknown, status = 200) => reply(JSON.stringify(body), status, { "Content-Type": "application/json" })
      if (lan && url.searchParams.has("k")) {
        if (!sameToken(url.searchParams.get("k")!, token)) return reply("Unauthorized", 401)
        url.searchParams.delete("k")
        return reply(null, 303, { Location: url.pathname + url.search, "Set-Cookie": `spec_host=${token}; HttpOnly; SameSite=Strict; Path=/` })
      }
      if (url.pathname === "/__spec/labels" && request.method === "POST") {
        const cookie = /(?:^|;\s*)spec_host=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? ""
        const by = lan ? sameToken(cookie, token) ? options.owner ?? process.env.SPEC_HOST_OWNER ?? "will" : undefined
          : local ? "local-test" : request.headers.get("Tailscale-User-Login")
        if (!by) return reply("Unauthorized", 401)
        const origin = request.headers.get("origin")
        const proxyHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
        // Tailscale terminates HTTPS before its authenticated loopback proxy.
        const tailscaleOrigin = !lan && !local && proxyHost && origin === `https://${proxyHost}`
        if (origin !== url.origin && !tailscaleOrigin) return reply("Origin required", 403)
        let input: z.infer<typeof labelInput>
        try { input = labelInput.parse(await request.json()) } catch { return reply("Invalid label", 400) }
        const value = await data()
        const run = value.runs.find(run => run.journey === input.journey && run.mode === input.mode && run.revision === input.revision)
        const step = run?.steps[input.step]
        if (input.mode === "mock" && input.revision !== await mockRevision()) return reply("Build changed; rerun mock", 409)
        if (!step || input.assertions.some(index => !step.assertions[index])) return reply("Receipt changed; reload", 409)
        const indices = input.assertions.length ? input.assertions : input.thumb === "up" ? step.assertions.map((_, index) => index) : []
        const disputed = indices.map(index => ({ index, ...step.assertions[index]! }))
        const evidence = disputed.flatMap(assertion => { const value = labelEvidence(assertion); return value ? [value] : [] })
        const rubrics = [...new Set(disputed.filter(assertion => assertion.kind === "rubric").flatMap(assertion => { const value = labelEvidence(assertion); return value ? [value.rubric] : [] }))]
        const filename = rubrics.length === 1 && disputed.every(assertion => assertion.kind === "rubric" || !labelEvidence(assertion)) && evidence.every(value => value.rubric === rubrics[0]) && ["claims-honest", "reply-actionable"].includes(rubrics[0]!) ? rubrics[0]! : "journey"
        const note = [input.note, ...input.assertions.map(index => { const assertion = step.assertions[index]!; return `Assertion ${index + 1}: ${assertion.kind}; expected ${JSON.stringify(assertion.expected)?.slice(0, 2000)}; actual ${["rubric", "fuzzy"].includes(assertion.kind) ? assertion.reason ?? "unverified" : JSON.stringify(assertion.actual)?.slice(0, 2000)}` })].filter(Boolean).join("\n")
        const label = { ...input, assertions: evidence, ...(note ? { note } : {}), by, at: new Date().toISOString() }
        const write = writes.then(async () => {
          const file = await open(resolve(labelsDirectory, `${filename}.jsonl`), constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
          try { await file.writeFile(JSON.stringify(label) + "\n") } finally { await file.close() }
        })
        writes = write.catch(() => {})
        try { await write } catch { return reply("Label write failed", 500) }
        return json({ counts: await countLabels(), agreement: await reports() }, 201)
      }
      if (request.method !== "GET" && request.method !== "HEAD") return reply(null, 405)
      if (url.pathname === "/__spec/data") return json({ ...await data(), counts: await countLabels(), agreement: await reports(), mockRevision: await mockRevision(), live: JSON.parse(process.env.SPEC_LIVE_URLS ?? '{"default":"https://smithers.sh","smithers":"https://smithers.sh","effeck":"https://effeck.dev"}'), drift: await Bun.file(resolve(resultsDirectory, "drift.json")).json().catch(() => null) })
      if (url.pathname === "/__spec/player.js") return reply(script, 200, { "Content-Type": "text/javascript" })
      if (url.pathname === "/__spec/player.css") return reply(await Bun.file(resolve(import.meta.dirname, "player/player.css")).text(), 200, { "Content-Type": "text/css" })
      if (url.pathname === "/__spec/capture") {
        await data()
        const path = screenshotPaths.get(url.searchParams.get("id") ?? "")
        return path ? reply(Bun.file(path), 200, { "Content-Type": "image/png" }) : reply("Capture unavailable", 404)
      }
      if (url.pathname === "/" && !url.searchParams.has("__spec_mock")) return reply(await Bun.file(resolve(import.meta.dirname, "player/player.html")).text(), 200, { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src 'self' https:; connect-src 'self'; frame-ancestors 'self'" })
      if (url.pathname.startsWith("/__spec/") || url.pathname.startsWith("/api/") || url.pathname === "/live") return reply(null, 404)
      try {
        const base = await realpath(dist)
        let path = resolve(base, "." + decodeURIComponent(url.pathname))
        if (!within(base, path) && path !== base) return reply(null, 403)
        try { path = await realpath(path); if ((await stat(path)).isDirectory()) path = await realpath(resolve(path, "index.html")) } catch { path = await realpath(resolve(base, "index.html")) }
        if (!within(base, path)) return reply(null, 403)
        return reply(Bun.file(path), 200, { "Content-Security-Policy": "connect-src 'self'; frame-ancestors 'self'" })
      } catch { return reply("Spec build unavailable", 404) }
    }
  })
  return { server, origin: `http://${hostname}:${server.port}`, close: () => server.stop(true) }
}
if (import.meta.main) startHost().then(host => console.log(`Spec host ${host.origin}`)).catch(error => { console.error(error); process.exitCode = 1 })
