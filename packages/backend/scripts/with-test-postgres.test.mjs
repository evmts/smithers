import test from "node:test"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./with-test-postgres.sh", import.meta.url))

// scratch is a private TMPDIR, so a test can prove the server's directory is gone.
const scratch = (t, cleanup = true) => {
  const root = mkdtempSync(join(tmpdir(), "with-test-postgres-test-"))
  if (cleanup) t.after(() => rmSync(root, { recursive: true, force: true }))
  const temp = join(root, "tmp")
  mkdirSync(temp)
  return { root, temp }
}

const run = (temp, env, command) =>
  spawnSync("bash", [script, ...command], { encoding: "utf8", env: { ...process.env, TMPDIR: temp, ...env } })

// fakeBin is a PostgreSQL whose initdb succeeds and whose server never starts.
const fakeBin = (root) => {
  const bin = join(root, "bin")
  mkdirSync(bin)
  writeFileSync(join(bin, "initdb"), "#!/bin/sh\nwhile [ $# -gt 0 ]; do [ \"$1\" = -D ] && mkdir -p \"$2\"; shift; done\nexit 0\n")
  writeFileSync(join(bin, "pg_ctl"), "#!/bin/sh\nfor a; do [ \"$a\" = start ] && { echo 'could not bind IPv4 address' >&2; exit 1; }; done\nexit 0\n")
  chmodSync(join(bin, "initdb"), 0o755)
  chmodSync(join(bin, "pg_ctl"), 0o755)
  return bin
}

// realBin finds a PostgreSQL the way the script does, or answers undefined.
const realBin = () => {
  if (process.env.PG_BIN) return process.env.PG_BIN
  const found = spawnSync("bash", ["-c", "dirname \"$(command -v pg_ctl)\""], { encoding: "utf8" })
  if (found.status === 0 && found.stdout.trim() !== ".") return found.stdout.trim()
  return ["/opt/homebrew/opt/postgresql@18/bin", "/opt/homebrew/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"]
    .find((dir) => existsSync(join(dir, "pg_ctl")))
}

test("a server that cannot start fails loudly and never runs the command", (t) => {
  const { root, temp } = scratch(t)
  const marker = join(root, "ran")
  const result = run(temp, { PG_BIN: fakeBin(root) }, ["touch", marker])
  assert.notEqual(result.status, 0, "a database the tests cannot reach must not pass as skipped")
  assert.match(result.stderr, /postgres did not start/)
  assert.match(result.stderr, /could not bind|postgres\.log/)
  assert.equal(existsSync(marker), false, "the command never runs without its database")
  assert.deepEqual(readdirSync(temp), [], "the server's directory is removed")
})

test("a missing PostgreSQL fails loudly", (t) => {
  const { root, temp } = scratch(t)
  const result = run(temp, { PG_BIN: join(root, "absent") }, ["true"])
  assert.equal(result.status, 69)
  assert.match(result.stderr, /no PostgreSQL initdb/)
})

test("a command is required", () => {
  const result = spawnSync("bash", [script], { encoding: "utf8" })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /usage/)
})

test("the command runs against a fresh required database and its status is kept", (t) => {
  const bin = realBin()
  if (!bin) {
    t.skip("no PostgreSQL programs on this host")
    return
  }
  const { temp } = scratch(t)
  const probe = `"${join(bin, "psql")}" "$SMITHERS_TEST_DATABASE_URL" -tAc 'select 1' && echo "required=$SMITHERS_REQUIRE_DATABASE_TESTS url=$SMITHERS_TEST_DATABASE_URL" && exit 7`
  const result = run(temp, { PG_BIN: bin }, ["bash", "-c", probe])
  assert.equal(result.status, 7, result.stderr)
  assert.match(result.stdout, /^1$/m)
  assert.match(result.stdout, /required=1 url=postgres:\/\/postgres:[0-9a-f]{32}@127\.0\.0\.1:\d+\/postgres\?sslmode=disable/)
  assert.deepEqual(readdirSync(temp), [], "the server is stopped and its directory removed")
})

test("the server checks passwords, so password-rejection tests can run", (t) => {
  const bin = realBin()
  if (!bin) {
    t.skip("no PostgreSQL programs on this host")
    return
  }
  const { temp } = scratch(t)
  const wrong = `"${join(bin, "psql")}" "$(printf %s "$SMITHERS_TEST_DATABASE_URL" | sed -E "s#//postgres:[^@]*@#//postgres:wrong@#")" -tAc "select 1"; echo "wrong=$?"`
  const result = run(temp, { PG_BIN: bin }, ["bash", "-c", wrong])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /wrong=2/)
  assert.match(result.stderr, /password authentication failed/)
})

const waitFor = async (probe, message) => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (probe()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(message)
}

const runningServer = async (t, locked = false) => {
  const bin = realBin()
  if (!bin) { t.skip("no PostgreSQL programs on this host"); return }
  const { root, temp } = scratch(t, false)
  const marker = join(root, "running")
  const lock = join(root, "lock")
  writeFileSync(lock, "")
  const child = locked
    ? spawn("bash", ["-c", `exec 9>"$1"; flock 9; exec bash "$2" bash -c 'exec 9>&-; touch "$1"; exec sleep 20' _ "$3"`, "_", lock, script, marker], {
        env: { ...process.env, PG_BIN: bin, TMPDIR: temp }, stdio: "ignore" })
    : spawn("bash", ["-c", `exec 9>"$1"; exec bash "$2" bash -c 'exec 9>&-; touch "$1"; exec sleep 20' _ "$3"`, "_", lock, script, marker], {
        env: { ...process.env, PG_BIN: bin, TMPDIR: temp }, stdio: "ignore" })
  let data
  t.after(() => {
    data ??= readdirSync(temp).map((entry) => join(temp, entry, "data"))[0]
    // child is our directly spawned launcher; pg_ctl verifies the private data directory.
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    if (data && existsSync(join(data, "postmaster.pid")))
      spawnSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"])
    rmSync(root, { recursive: true, force: true })
  })
  await waitFor(() => existsSync(marker), "command did not start")
  data = join(temp, readdirSync(temp)[0], "data")
  const pid = Number(readFileSync(join(data, "postmaster.pid"), "utf8").split("\n")[0])
  return { child, data, pid, lock }
}

test("SIGKILL of the launcher stops its postmaster and removes its directory", async (t) => {
  const server = await runningServer(t)
  if (!server) return
  server.child.kill("SIGKILL")
  await waitFor(() => {
    try { process.kill(server.pid, 0); return false } catch (error) {
      if (error.code !== "ESRCH") throw error
      return !existsSync(join(server.data, ".."))
    }
  }, "orphaned postmaster or temporary directory survived launcher SIGKILL")
})

test("postmaster does not inherit the caller lock descriptor", async (t) => {
  const flock = spawnSync("flock", ["--version"])
  if (!flock.error) {
    const server = await runningServer(t, true)
    if (!server) return
    assert.notEqual(spawnSync("flock", ["-n", server.lock, "true"]).status, 0,
      "launcher must hold the test lock before it is killed")
    // Release the launcher copy; the server must not retain fd 9.
    server.child.kill("SIGKILL")
    await new Promise((resolve) => server.child.once("exit", resolve))
    process.kill(server.pid, 0)
    assert.equal(spawnSync("flock", ["-n", server.lock, "true"]).status, 0,
      "postmaster retained the caller lock")
    process.kill(server.pid, 0)
  } else {
    if (spawnSync("lsof", ["-v"]).error) { t.skip("flock and lsof unavailable; cannot inspect postmaster descriptors"); return }
    const server = await runningServer(t)
    if (!server) return
    const descriptors = spawnSync("lsof", ["-a", "-p", String(server.pid), "-d", "9", "-Fn"], { encoding: "utf8" })
    assert.ok([0, 1].includes(descriptors.status), descriptors.stderr)
    assert.equal(descriptors.stdout.includes(server.lock), false, "postmaster retained fd 9")
  }
})
