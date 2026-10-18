import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { main } from "../src/cli/Entry.ts"

test("site CLI uploads exact bytes with a version fence and rejects symlinks before sending", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-domains-cli-"))
  const writes: Array<Record<string, unknown>> = []
  const server = createServer(async (request, response) => {
    expect(request.url).toBe("/api/repos/owner/docs/site")
    expect(request.headers.authorization).toBe("token fixture-site-token")
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET") {
      response.end(JSON.stringify({ site: { active: "old-version" } }))
      return
    }
    let text = ""
    for await (const chunk of request) text += chunk
    const body = JSON.parse(text) as Record<string, unknown>
    writes.push(body)
    response.end(JSON.stringify({ enabled: true, active: "new-version" }))
  })
  const port = 49400 + Math.floor(Math.random() * 2000)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  const env = {
    HOME: root,
    XDG_CONFIG_HOME: root,
    XDG_DATA_HOME: root,
    SMITHERS_AUTH_FILE: join(root, "auth.json"),
    SMITHERS_API_ORIGIN: `http://127.0.0.1:${port}`,
    SMITHERS_TOKEN: "fixture-site-token",
    SMITHERS_DISABLE_SYSTEM_KEYRING: "1"
  }
  const run = async (argv: string[]) => {
    let output = "", error = "", code = 0
    const events = new EventEmitter()
    await main({
      argv: [...argv, "--audience", "human"],
      env,
      stdout: {
        isTTY: false,
        columns: 80,
        write: (text) => {
          output += text
        }
      },
      stderr: {
        isTTY: false,
        columns: 80,
        write: (text) => {
          error += text
        }
      },
      on: (signal, listener) => {
        events.on(signal, listener)
      },
      removeListener: (signal, listener) => {
        events.removeListener(signal, listener)
      },
      setExitCode: (value) => {
        code = value
      }
    })
    expect(output + error).not.toContain("fixture-site-token")
    return { output, error, code }
  }
  try {
    const directory = join(root, "publication")
    await mkdir(join(directory, "spec"), { recursive: true })
    await writeFile(join(directory, "index.html"), "<h1>Docs</h1>")
    await writeFile(join(directory, "spec", "intro.md"), "# Intro\n")
    const result = await run(["site", "publish", directory, "--repo", "owner/docs", "--yes"])
    expect(result, result.error).toMatchObject({ code: 0 })
    expect(writes).toEqual([{
      action: "publish",
      expected: "old-version",
      files: [
        { path: "index.html", data: Buffer.from("<h1>Docs</h1>").toString("base64") },
        { path: "spec/intro.md", data: Buffer.from("# Intro\n").toString("base64") }
      ]
    }])
    await symlink(join(root, "private"), join(directory, "escape"))
    await writeFile(join(root, "private"), "must-not-upload")
    expect((await run(["site", "publish", directory, "--repo", "owner/docs", "--yes"])).code).not.toBe(0)
    expect(writes).toHaveLength(1)
    expect((await run(["site", "domain", "add", "docs.customer.test", "--repo", "owner/docs"])).code).toBe(0)
    expect(writes[1]).toEqual({ action: "domain.add", domain: "docs.customer.test" })
    expect((await run(["site", "activate", "retained", "--repo", "owner/docs", "--expected", "new-version"])).code)
      .toBe(0)
    expect(writes[2]).toEqual({ action: "activate", version: "retained", expected: "new-version" })
    expect((await run(["site", "enable", "--repo", "owner/docs", "--app-prefix", "/repo/"])).code).toBe(0)
    expect(writes[3]).toEqual({ action: "enable", name: "", appPrefix: "/repo/" })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    await rm(root, { recursive: true, force: true })
  }
})
