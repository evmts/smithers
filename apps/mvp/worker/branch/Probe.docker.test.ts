// The idle probe (worker/branch/Machine.ts `PROBE`) in a real branch-sandbox container, whose PID 1 is `sleep infinity`
// as in production: an orphan reparented to it is never reaped and stays a zombie. A zombie isn't work, so it never
// keeps the machine awake (in production three zombie `git`s kept a box awake for hours); a running process does. It
// skips only when Docker is absent, as @smthrs/platform-cloudflare's workerd terminal test does.
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { PROBE } from "./Machine.ts"

const image = "smithers-branch-sandbox:test"
const context = fileURLToPath(new URL("../../infra/sandbox", import.meta.url))

const docker = (args: ReadonlyArray<string>) => spawnSync("docker", args, { encoding: "utf8" })
const present = docker(["version", "--format", "{{.Server.Version}}"]).status === 0

let container = ""

/** Runs `argv` in the container as `user` (uid:gid): its exit status. */
const exec = (user: string, argv: ReadonlyArray<string>) => docker(["exec", "--user", user, container, ...argv]).status

/** The probe, run as root as the machine runs it, with an idle time of a minute. */
const probe = () => exec("0:0", ["sh", "-c", PROBE, "probe", "60"])

describe.skipIf(!present)("the idle probe in a real container", () => {
  beforeAll(() => {
    if (docker(["image", "inspect", image]).status !== 0) execFileSync("docker", ["build", "-t", image, context])
    container = docker(["run", "-d", "--rm", image]).stdout.trim()
  }, 600_000)
  afterAll(() => {
    if (container !== "") docker(["rm", "-f", container])
  })

  test("a zombie a person left behind is not work; a process they run is", () => {
    expect(probe()).toBe(0)
    // A person's background command whose parent exits: reparented to PID 1, which never reaps it, so it ends a zombie.
    expect(exec("585780777:2000", ["sh", "-c", "(sleep 0.2 &); true"])).toBe(0)
    execFileSync("sleep", ["1"])
    const zombies = docker(["exec", container, "sh", "-c", "grep -l '^State:[[:space:]]*Z' /proc/[0-9]*/status | wc -l"])
    expect(Number(zombies.stdout.trim())).toBeGreaterThan(0)
    expect(probe()).toBe(0)
    // A process the person still runs keeps the machine awake.
    expect(docker(["exec", "-d", "--user", "585780777:2000", container, "sleep", "30"]).status).toBe(0)
    execFileSync("sleep", ["1"])
    expect(probe()).toBe(3)
  }, 60_000)
})
