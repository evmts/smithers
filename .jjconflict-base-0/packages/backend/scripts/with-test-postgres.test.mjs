import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./with-test-postgres.sh", import.meta.url))

// scratch is a private TMPDIR, so a test can prove the server's directory is gone.
const scratch = (t) => {
  const root = mkdtempSync(join(tmpdir(), "with-test-postgres-test-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
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
  assert.match(result.stdout, /required=1 url=postgres:\/\/postgres@127\.0\.0\.1:\d+\/postgres\?sslmode=disable/)
  assert.deepEqual(readdirSync(temp), [], "the server is stopped and its directory removed")
})
