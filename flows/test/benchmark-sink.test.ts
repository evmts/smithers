import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createSink } from "../benchmark/sink.ts"

const command = async (program: string, args: string[], cwd?: string, extra: NodeJS.ProcessEnv = {}) =>
  new Promise<string>((accept, reject) => {
    const child = spawn(program, args, {
      cwd,
      shell: false,
      env: { ...process.env, ...extra },
      stdio: ["ignore", "pipe", "pipe"]
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })
    child.on("error", reject)
    child.on(
      "close",
      (code) => code === 0 ? accept(stdout.trim()) : reject(new Error(`${program} exited ${code}: ${stderr}`))
    )
  })

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "smithers-benchmark-sink-test-"))
  const remote = join(directory, "results.git")
  const source = join(directory, "source")
  await command("git", ["init", "--bare", "--initial-branch=main", remote])
  await mkdir(source)
  const options = {
    checkout: join(directory, "checkout"),
    remote,
    job: "job-1",
    env: process.env,
    secrets: [] as string[]
  }
  return {
    directory,
    remote,
    source,
    options,
    sink: createSink(options),
    cleanup: () => rm(directory, { recursive: true, force: true })
  }
}

test("real LFS sink publishes a trial, then a fresh clone retrieves and extracts the exact bytes", async () => {
  const f = await fixture()
  try {
    const bytes = Buffer.from([0, 255, 10, 100, 0, 3])
    await mkdir(join(f.source, "journal"))
    await writeFile(join(f.source, "journal", "events.bin"), bytes)
    await writeFile(join(f.source, "stdout.txt"), "model-free trial\n")
    const summary = { task: "noop", reward: 1, wall: 0, tokens: 0 }
    const receipt = await f.sink.exportTrial({ id: "trial-1", source: f.source, summary })
    assert.match(receipt.commit, /^[0-9a-f]{40}$/)
    assert.equal(receipt.path, "jobs/job-1/trial-1.tar.zst")
    assert.equal(await command("git", ["--git-dir", f.remote, "rev-parse", "main"]), receipt.commit)
    const pointer = await command("git", ["--git-dir", f.remote, "show", `main:${receipt.path}`])
    assert.match(pointer, /^version https:\/\/git-lfs.github.com\/spec\/v1\noid sha256:[0-9a-f]{64}\nsize \d+$/)
    const fresh = join(f.directory, "another-machine")
    await command("git", ["clone", f.remote, fresh], undefined, { GIT_LFS_SKIP_SMUDGE: "1" })
    assert.equal((await readFile(join(fresh, receipt.path), "utf8")).trim(), pointer)
    await command("git", ["lfs", "install", "--local"], fresh)
    await command("git", ["lfs", "pull", "--include", receipt.path], fresh)
    const extracted = join(f.directory, "extracted")
    await mkdir(extracted)
    await command("tar", ["--zstd", "-xf", join(fresh, receipt.path), "-C", extracted])
    assert.deepEqual(await readFile(join(extracted, "journal", "events.bin")), bytes)
    assert.equal(await readFile(join(extracted, "stdout.txt"), "utf8"), "model-free trial\n")
    assert.deepEqual(JSON.parse(await readFile(join(fresh, "jobs/job-1/trial-1/summary.json"), "utf8")), summary)
    assert.deepEqual(await readFile(join(f.source, "journal/events.bin")), bytes)
  } finally {
    await f.cleanup()
  }
})

test("streamed redaction spans chunk boundaries and escapes, excludes auth and preserves source", async () => {
  const f = await fixture()
  try {
    const secret = "private-token-é-\"line\nvalue"
    const ascii = JSON.stringify(secret).slice(1, -1).replace(
      /[\u0080-\uffff]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
    const sink = createSink({ ...f.options, secrets: [secret] })
    await writeFile(
      join(f.source, "log.txt"),
      "x".repeat(65_530) + secret + " END " + JSON.stringify(secret) + " ASCII " + ascii
    )
    await writeFile(join(f.source, "auth.json"), JSON.stringify({ token: secret }))
    await mkdir(join(f.source, "shims"))
    await writeFile(join(f.source, "shims", "git"), secret)
    await writeFile(join(f.source, ".env"), secret)
    const receipt = await sink.exportTrial({ id: "safe", source: f.source, summary: { exception: secret } })
    const extracted = join(f.directory, "safe-extract")
    await mkdir(extracted)
    await command("tar", ["--zstd", "-xf", join(f.options.checkout, receipt.path), "-C", extracted])
    const log = await readFile(join(extracted, "log.txt"), "utf8")
    assert.equal(log, "x".repeat(65_530) + "[REDACTED] END \"[REDACTED]\" ASCII [REDACTED]")
    assert.deepEqual(await readdir(extracted), ["log.txt"])
    const summary = JSON.parse(await readFile(join(f.options.checkout, "jobs/job-1/safe/summary.json"), "utf8"))
    assert.equal(summary.exception, "[REDACTED]")
    assert.ok((await readFile(join(f.source, "log.txt"), "utf8")).includes(secret))
  } finally {
    await f.cleanup()
  }
})

test("binary credentials, symlinks and source escapes fail before publication", async () => {
  const f = await fixture()
  try {
    const sink = createSink({ ...f.options, secrets: ["sensitive-token"] })
    await writeFile(join(f.source, "journal.bin"), Buffer.from("\0sensitive-token\0"))
    await assert.rejects(
      sink.exportTrial({ id: "binary", source: f.source, summary: {} }),
      /Binary artifact contains credentials/
    )
    assert.deepEqual(await readFile(join(f.source, "journal.bin")), Buffer.from("\0sensitive-token\0"))
    await rm(join(f.source, "journal.bin"))
    await symlink(f.remote, join(f.source, "escape"))
    await assert.rejects(sink.exportTrial({ id: "link", source: f.source, summary: {} }), /symlink/)
    await symlink(f.source, join(f.directory, "source-link"))
    await assert.rejects(
      sink.exportTrial({ id: "root-link", source: join(f.directory, "source-link"), summary: {} }),
      /Invalid trial source/
    )
    await assert.rejects(command("git", ["--git-dir", f.remote, "rev-parse", "main"]))
  } finally {
    await f.cleanup()
  }
})

test("immutable trial exports are idempotent and refuse changed summaries or source bytes", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.source, "events.jsonl"), "original\n")
    const trial = { id: "once", source: f.source, summary: { reward: 1 } }
    const first = await f.sink.exportTrial(trial)
    await writeFile(join(f.source, ".exported.json"), JSON.stringify(first))
    assert.deepEqual(await f.sink.exportTrial(trial), first)
    await assert.rejects(f.sink.exportTrial({ ...trial, summary: { reward: 0 } }), /Immutable trial collision/)
    await writeFile(join(f.source, "events.jsonl"), "different\n")
    await assert.rejects(f.sink.exportTrial(trial), /Immutable trial collision/)
    assert.equal(await command("git", ["--git-dir", f.remote, "rev-parse", "main"]), first.commit)
  } finally {
    await f.cleanup()
  }
})

test("concurrent clones retry a nonfastforward without losing another immutable trial", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.source, "events"), "same fixture")
    await f.sink.writeReports({ "report.md": "baseline" })
    const other = createSink({ ...f.options, checkout: join(f.directory, "other-checkout") })
    const receipts = await Promise.all([
      f.sink.exportTrial({ id: "left", source: f.source, summary: { arm: "smithers" } }),
      other.exportTrial({ id: "right", source: f.source, summary: { arm: "codex" } })
    ])
    for (const id of ["left", "right"]) {
      assert.match(
        await command("git", ["--git-dir", f.remote, "show", `main:jobs/job-1/${id}.tar.zst`]),
        /oid sha256:/
      )
    }
    assert.equal(await command("git", ["--git-dir", f.remote, "rev-list", "--count", "main"]), "3")
    for (const receipt of receipts) assert.match(receipt.commit, /^[a-f0-9]{40}$/)
  } finally {
    await f.cleanup()
  }
})

test("a shared checkout serializes publishers across distinct sink instances", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.source, "events"), "shared checkout")
    const other = createSink(f.options)
    await Promise.all([
      f.sink.exportTrial({ id: "one", source: f.source, summary: 1 }),
      other.exportTrial({ id: "two", source: f.source, summary: 2 })
    ])
    assert.equal(await command("git", ["--git-dir", f.remote, "show", "main:jobs/job-1/one/summary.json"]), "1")
    assert.equal(await command("git", ["--git-dir", f.remote, "show", "main:jobs/job-1/two/summary.json"]), "2")
  } finally {
    await f.cleanup()
  }
})

test("a rejected push returns no receipt, redacts errors, retains the source and permits retry", async () => {
  const f = await fixture()
  try {
    const secret = "push-rejection-private-value"
    const sink = createSink({ ...f.options, secrets: [secret] })
    await writeFile(join(f.source, "journal"), "keep this journal")
    const hook = join(f.remote, "hooks", "pre-receive")
    await writeFile(hook, `#!/bin/sh\nprintf '%s\\n' '${secret}' >&2\nexit 1\n`, { mode: 0o755 })
    let receipt: unknown
    await assert.rejects(
      async () => {
        receipt = await sink.exportTrial({ id: "retry", source: f.source, summary: {} })
      },
      (error: Error) =>
        error.message.includes("source retained") && error.message.includes("[REDACTED]") &&
        !error.message.includes(secret)
    )
    assert.equal(receipt, undefined)
    assert.equal(await readFile(join(f.source, "journal"), "utf8"), "keep this journal")
    await assert.rejects(command("git", ["--git-dir", f.remote, "rev-parse", "main"]))
    await rm(hook)
    const successful = await sink.exportTrial({ id: "retry", source: f.source, summary: {} })
    assert.equal(await command("git", ["--git-dir", f.remote, "rev-parse", "main"]), successful.commit)
  } finally {
    await f.cleanup()
  }
})

test("reports publish before any trial and redact credentials without requiring an LFS object", async () => {
  const f = await fixture()
  try {
    const sink = createSink({ ...f.options, secrets: ["report-secret"] })
    const reports = {
      "meter.json": "{\"token\":\"report-secret\"}",
      "report.md": "report-secret",
      "health.md": "healthy",
      "trials.json": "[]",
      "report.json": "{}",
      "versions.json": "{}",
      "input.json": "{}",
      "samples.jsonl": "{}\n"
    }
    const receipt = await sink.writeReports(reports)
    assert.equal(await command("git", ["--git-dir", f.remote, "rev-parse", "main"]), receipt.commit)
    assert.equal(await command("git", ["--git-dir", f.remote, "show", "main:jobs/job-1/report.md"]), "[REDACTED]")
    assert.equal(
      await command("git", ["--git-dir", f.remote, "show", "main:jobs/job-1/meter.json"]),
      "{\"token\":\"[REDACTED]\"}"
    )
    assert.deepEqual(await sink.writeReports(reports), receipt)
    for (const name of Object.keys(reports)) {
      assert.ok(await readFile(join(f.options.checkout, "jobs/job-1", name), "utf8"))
    }
    await assert.rejects(sink.writeReports({ "../secret": "bad" }), /Unsupported/)
    await assert.rejects(sink.writeReports({}), /No benchmark reports/)
  } finally {
    await f.cleanup()
  }
})

test("unsafe names and credential-bearing remotes are rejected", async () => {
  const f = await fixture()
  try {
    for (const job of ["../escape", "a/b", "..", "-option", ""]) {
      assert.throws(() => createSink({ ...f.options, job }), /Unsafe/)
    }
    for (
      const remote of ["https://token@example.test/results", "https://example.test/results?token=abc", "-option", ""]
    ) {
      assert.throws(() => createSink({ ...f.options, remote }), /remote/i)
    }
    for (const id of ["../escape", "a/b", "..", "-option", ""]) {
      await assert.rejects(f.sink.exportTrial({ id, source: f.source, summary: {} }), /Unsafe/)
    }
  } finally {
    await f.cleanup()
  }
})

test("refresh clones an empty remote and fast-forwards existing remote summary records", async () => {
  const f = await fixture()
  try {
    await f.sink.refresh()
    assert.equal(await command("git", ["symbolic-ref", "--short", "HEAD"], f.options.checkout), "main")
    const other = createSink({ ...f.options, checkout: join(f.directory, "writer") })
    await other.writeReports({ "trials.json": "[{\"id\":\"remote-trial\"}]" })
    await f.sink.refresh()
    assert.equal(
      await readFile(join(f.options.checkout, "jobs/job-1/trials.json"), "utf8"),
      "[{\"id\":\"remote-trial\"}]"
    )
  } finally {
    await f.cleanup()
  }
})

test("cancellation interrupts a running push and retains the source without a receipt", async () => {
  const f = await fixture()
  try {
    const controller = new AbortController()
    const sink = createSink({ ...f.options, signal: controller.signal })
    await sink.refresh()
    await writeFile(join(f.source, "journal"), "durable source")
    const entered = join(f.directory, "push-entered")
    const late = join(f.directory, "orphan-write")
    const resistant = join(f.directory, "resistant.mjs")
    const script =
      `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setTimeout(()=>require('node:fs').writeFileSync(process.env.LATE,'orphan'),1500);setInterval(()=>{},1000)"],{env:{...process.env,LATE:${
        JSON.stringify(late)
      }},stdio:'inherit'});writeFileSync(${JSON.stringify(entered)},'ready');setInterval(()=>{},1000);`
    await writeFile(resistant, script)
    const quotedNode = "'" + process.execPath.replaceAll("'", "'\\''") + "'"
    await writeFile(join(f.remote, "hooks/pre-receive"), `#!/bin/sh\ntrap '' TERM\n${quotedNode} '${resistant}'\n`, {
      mode: 0o755
    })
    const exporting = sink.exportTrial({ id: "cancel", source: f.source, summary: {} })
    const deadline = Date.now() + 30_000
    for (;;) {
      try {
        await readFile(entered)
        break
      } catch {
        if (Date.now() > deadline) {
          controller.abort()
          throw new Error("Push did not reach the real remote hook")
        }
        await new Promise((accept) => setTimeout(accept, 25))
      }
    }
    controller.abort()
    await assert.rejects(exporting, /cancelled; source retained/)
    await new Promise((accept) => setTimeout(accept, 1800))
    await assert.rejects(readFile(late), /ENOENT/)
    assert.equal(await readFile(join(f.source, "journal"), "utf8"), "durable source")
    await assert.rejects(command("git", ["--git-dir", f.remote, "rev-parse", "main"]))
    await rm(join(f.remote, "hooks/pre-receive"))
    const receipt = await f.sink.exportTrial({ id: "cancel", source: f.source, summary: {} })
    assert.equal(await command("git", ["--git-dir", f.remote, "rev-parse", "main"]), receipt.commit)
  } finally {
    await f.cleanup()
  }
})
