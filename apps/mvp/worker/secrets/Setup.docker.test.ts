// The box's egress setup (worker/secrets/SandboxEgress.ts `SETUP`) in a real branch-sandbox container, run as root
// with the environment on stdin as a wake runs it: a login shell of another user gets the placeholders and Node's extra
// CA, the container's CA is trusted system-wide, and the script prints nothing even when a step fails, since workerd
// reports a command's exit only once its unread output closes. It skips only when Docker is absent, as the idle
// probe's test does.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { CONTAINER_CA, SETUP } from "./SandboxEgress.ts"

const image = "smithers-branch-sandbox:test"
const context = fileURLToPath(new URL("../../infra/sandbox", import.meta.url))
const PLACEHOLDER = `smthrs-secret-${"ab".repeat(32)}`

const docker = (args: ReadonlyArray<string>, input?: string) =>
  spawnSync("docker", args, { encoding: "utf8", ...(input === undefined ? {} : { input }) })
const present = docker(["version", "--format", "{{.Server.Version}}"]).status === 0

let container = ""
let scratch = ""

/** Runs the setup as root with `environment` on stdin: its status and everything it printed. */
const setup = (environment: string) => {
  const run = docker(["exec", "-i", "--user", "0:0", container, "sh", "-c", SETUP], environment)
  return { status: run.status, printed: run.stdout + run.stderr }
}

/** What a login shell of a person's user sees. */
const login = (script: string) => docker(["exec", "--user", "585780777:2000", container, "bash", "-lc", script]).stdout

describe.skipIf(!present)("the egress setup in a real container", () => {
  beforeAll(() => {
    if (docker(["image", "inspect", image]).status !== 0) execFileSync("docker", ["build", "-t", image, context])
    container = docker(["run", "-d", "--rm", image]).stdout.trim()
    // A CA where Cloudflare puts the container's own.
    scratch = mkdtempSync(join(tmpdir(), "egress-setup-"))
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=egress-setup-test",
      "-keyout", join(scratch, "ca.key"), "-out", join(scratch, "ca.crt"),
    ], { stdio: "ignore" })
    docker(["exec", "--user", "0:0", container, "mkdir", "-p", "/etc/cloudflare/certs"])
    docker(["cp", join(scratch, "ca.crt"), `${container}:${CONTAINER_CA}`])
  }, 600_000)
  afterAll(() => {
    if (container !== "") docker(["rm", "-f", container])
    if (scratch !== "") rmSync(scratch, { recursive: true, force: true })
  })

  test("a login shell gets the placeholders and Node's CA, the CA is trusted, and nothing is printed", () => {
    expect(setup(`DEMO_TOKEN=${PLACEHOLDER}\n`)).toEqual({ status: 0, printed: "" })
    expect(login(`printf '%s|%s' "$DEMO_TOKEN" "$NODE_EXTRA_CA_CERTS"`)).toBe(`${PLACEHOLDER}|${CONTAINER_CA}`)
    expect(docker(["exec", container, "test", "-e", "/etc/ssl/certs/cloudflare-containers-ca.pem"]).status).toBe(0)
  }, 60_000)

  test("a CA that can't be trusted is exit 2, still prints nothing, and the placeholders still reach a shell", () => {
    docker(["exec", "--user", "0:0", container, "sh", "-c", "rm -rf /usr/local/share/ca-certificates && touch /usr/local/share/ca-certificates"])
    expect(setup(`OTHER_TOKEN=${PLACEHOLDER}\n`)).toEqual({ status: 2, printed: "" })
    expect(login(`printf '%s' "$OTHER_TOKEN"`)).toBe(PLACEHOLDER)
  }, 60_000)
})
