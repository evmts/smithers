import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve, sep } from "node:path"

export interface SinkOptions {
  readonly checkout: string
  readonly remote: string
  readonly job: string
  readonly env: NodeJS.ProcessEnv
  readonly secrets: ReadonlyArray<string>
  readonly signal?: AbortSignal
}

const safeName = (value: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value) || value === "." || value === "..") {
    throw new Error("Unsafe benchmark artifact name")
  }
  return value
}

const excluded = (name: string): boolean =>
  /^(?:\.git|\.codex|\.smithers|\.ssh|\.exported\.json|shims?|auth\.json|credentials?(?:\..*)?|config\.toml|\.env(?:\..*)?|.*askpass.*)$/i
    .test(name)

/** Secrets travel through the process environment, never git URLs or command arguments. */
export function createSink(options: SinkOptions) {
  const job = safeName(options.job)
  const checkout = resolve(options.checkout)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(options.remote)) {
    const url = new URL(options.remote)
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("Results remote must not contain credentials")
    }
  }
  if (!options.remote || options.remote.startsWith("-") || /[\r\n]/.test(options.remote)) {
    throw new Error("Invalid results remote")
  }
  const variants = [
    ...new Set(
      options.secrets.filter(Boolean).flatMap((secret) => [
        secret,
        JSON.stringify(secret).slice(1, -1),
        JSON.stringify(secret).slice(1, -1).replace(
          /[\u0080-\uffff]/g,
          (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
        ),
        JSON.stringify(secret).slice(1, -1).replaceAll("/", "\\/"),
        encodeURIComponent(secret),
        Buffer.from(secret).toString("base64")
      ])
    )
  ].sort((a, b) => b.length - a.length)
  if (variants.some((secret) => options.remote.includes(secret))) {
    throw new Error("Results remote must not contain credentials")
  }
  const patterns = variants.map((value) => Buffer.from(value))
  const redact = (value: string): string =>
    variants.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value)
  const env = {
    ...options.env,
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Smithers benchmark",
    GIT_AUTHOR_EMAIL: "benchmark@smithers.local",
    GIT_COMMITTER_NAME: "Smithers benchmark",
    GIT_COMMITTER_EMAIL: "benchmark@smithers.local"
  }
  let branch = "main"
  const checkCancelled = () => {
    if (options.signal?.aborted) throw new Error("Benchmark artifact operation cancelled; source retained")
  }

  const command = (
    program: string,
    args: ReadonlyArray<string>,
    cwd?: string
  ): Promise<{ code: number; stdout: string }> =>
    new Promise((accept, reject) => {
      try {
        checkCancelled()
      } catch (error) {
        reject(error)
        return
      }
      const child = spawn(program, args, {
        cwd,
        env,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      })
      let killTimer: ReturnType<typeof setTimeout> | undefined
      const kill = (signal: NodeJS.Signals) => {
        if (child.pid) {
          try {
            if (process.platform === "win32") child.kill(signal)
            else process.kill(-child.pid, signal)
          } catch { /* Already exited. */ }
        }
      }
      const abort = () => {
        kill("SIGTERM")
        killTimer ??= setTimeout(() => kill("SIGKILL"), 250)
        killTimer.unref()
      }
      options.signal?.addEventListener("abort", abort, { once: true })
      if (options.signal?.aborted) abort()
      const captureLimit = 128 * 1024 + Math.max(0, ...patterns.map((pattern) => pattern.length))
      let stdout = Buffer.alloc(0)
      let stderr = Buffer.alloc(0)
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk]).subarray(-captureLimit)
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = Buffer.concat([stderr, chunk]).subarray(-captureLimit)
      })
      child.once("error", () =>
        reject(
          new Error(
            options.signal?.aborted
              ? "Benchmark artifact operation cancelled; source retained" :
              `Benchmark artifact tool unavailable: ${program}`
          )
        ))
      child.once("close", (code) => {
        options.signal?.removeEventListener("abort", abort)
        if (killTimer !== undefined) clearTimeout(killTimer)
        if (options.signal?.aborted) {
          kill("SIGKILL")
          reject(new Error("Benchmark artifact operation cancelled; source retained"))
        } else {
          const captured = code === 0 || !stderr.length ? stdout : stderr
          const text = captured.toString()
          // Discard a truncated prefix after redaction, including any partial secret at that boundary.
          const prefix = captured.length === captureLimit ? captureLimit - 128 * 1024 : 0
          accept({ code: code ?? 1, stdout: code === 0 ? text : redact(text).slice(prefix).slice(-128 * 1024) })
        }
      })
    })
  const git = (args: ReadonlyArray<string>) => command("git", args, checkout)
  const checked = async (program: string, args: ReadonlyArray<string>, cwd?: string) => {
    const result = await command(program, args, cwd)
    if (result.code !== 0) throw new Error(`${program} artifact operation failed: ${result.stdout}`)
    return result.stdout.trim()
  }

  const locked = async <A>(body: () => Promise<A>): Promise<A> => {
    await mkdir(dirname(checkout), { recursive: true })
    const lock = `${checkout}.benchmark-lock`
    const deadline = Date.now() + 60_000
    for (;;) {
      checkCancelled()
      try {
        await mkdir(lock, { mode: 0o700 })
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        if (Date.now() >= deadline) throw new Error("Benchmark artifact checkout is locked; source retained")
        await new Promise((accept) => setTimeout(accept, 100))
      }
    }
    try {
      await writeFile(join(lock, "owner"), `${process.pid}\n`, { mode: 0o600 })
      let exists = false
      try {
        exists = (await lstat(checkout)).isDirectory()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      if (!exists) await checked("git", ["clone", "--", options.remote, checkout])
      if (
        !(await lstat(join(checkout, ".git"))).isDirectory()
        || await realpath(await checked("git", ["rev-parse", "--show-toplevel"], checkout)) !== await realpath(checkout)
      ) {
        throw new Error("Results checkout must be a dedicated Git clone")
      }
      if ((await checked("git", ["remote", "get-url", "origin"], checkout)) !== options.remote) {
        throw new Error("Results checkout belongs to another remote")
      }
      branch = await checked("git", ["symbolic-ref", "--short", "HEAD"], checkout)
      await checked("git", ["lfs", "install", "--local"], checkout)
      return await body()
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
  }

  const synchronize = async () => {
    await checked("git", ["fetch", "origin"], checkout)
    if ((await git(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`])).code === 0) {
      await checked("git", ["reset", "--hard", `refs/remotes/origin/${branch}`], checkout)
    }
    // A rejected push may leave staged/untracked output. Only this dedicated clone is modified.
    await checked("git", ["clean", "-fd"], checkout)
  }

  const assertContained = async (relative: string) => {
    let path = checkout
    for (const component of relative.split("/")) {
      path = join(path, component)
      try {
        if ((await lstat(path)).isSymbolicLink()) throw new Error("Results checkout contains a symlink")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        return
      }
    }
  }

  const publish = async (prepare: () => Promise<void>, message: string): Promise<string> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await synchronize()
      const tracked = await checked("git", ["ls-files", "--stage"], checkout)
      if (tracked.split("\n").some((line) => line.startsWith("120000 "))) {
        throw new Error("Results checkout contains a symlink")
      }
      await assertContained(".gitattributes")
      await assertContained(`jobs/${job}`)
      await prepare()
      await checked("git", ["add", "--", ".gitattributes", `jobs/${job}`], checkout)
      if ((await git(["diff", "--cached", "--quiet"])).code !== 0) {
        await checked("git", ["commit", "-m", message], checkout)
      }
      const result = await git(["push", "origin", `HEAD:refs/heads/${branch}`])
      if (result.code === 0) return checked("git", ["rev-parse", "HEAD"], checkout)
      if (attempt === 3) throw new Error(`Results push failed; source retained: ${result.stdout}`)
    }
    throw new Error("Results push failed; source retained")
  }

  const sanitizeFile = async (source: string, target: string): Promise<string> => {
    const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
    const output = await open(target, "wx", 0o600)
    const hash = createHash("sha256")
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let binary = false
    let foundSecret = false
    let pending = Buffer.alloc(0)
    const keep = Math.max(0, ...patterns.map((pattern) => pattern.length - 1))
    const emit = async (bytes: Buffer) => {
      hash.update(bytes)
      await output.write(bytes)
    }
    const flush = async (last: boolean) => {
      const boundary = last ? pending.length : Math.max(0, pending.length - keep)
      let cursor = 0
      while (cursor < boundary) {
        let position = pending.length
        let length = 0
        for (const pattern of patterns) {
          const index = pending.indexOf(pattern, cursor)
          if (index >= 0 && index < position) {
            position = index
            length = pattern.length
          }
        }
        if (position >= boundary) {
          await emit(pending.subarray(cursor, boundary))
          cursor = boundary
          break
        }
        await emit(pending.subarray(cursor, position))
        await emit(Buffer.from("[REDACTED]"))
        foundSecret = true
        cursor = position + length
      }
      pending = Buffer.from(pending.subarray(cursor))
    }
    try {
      const initial = await input.stat()
      if (!initial.isFile()) throw new Error("Artifact source contains a special file")
      const buffer = Buffer.alloc(64 * 1024)
      for (;;) {
        checkCancelled()
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null)
        if (!bytesRead) break
        const bytes = buffer.subarray(0, bytesRead)
        if (bytes.includes(0)) binary = true
        try {
          decoder.decode(bytes, { stream: true })
        } catch {
          binary = true
        }
        pending = Buffer.concat([pending, bytes])
        await flush(false)
      }
      try {
        decoder.decode()
      } catch {
        binary = true
      }
      await flush(true)
      const final = await input.stat()
      if (initial.size !== final.size || initial.mtimeMs !== final.mtimeMs || initial.ctimeMs !== final.ctimeMs) {
        throw new Error("Artifact source changed during export; source retained")
      }
      if (binary && foundSecret) throw new Error("Binary artifact contains credentials; source retained")
      return hash.digest("hex")
    } finally {
      await Promise.all([input.close(), output.close()])
    }
  }

  const exportTrial = async (trial: { readonly id: string; readonly source: string; readonly summary: unknown }) => {
    checkCancelled()
    const id = safeName(trial.id)
    const source = resolve(trial.source)
    if ((await lstat(source)).isSymbolicLink() || !(await lstat(source)).isDirectory()) {
      throw new Error("Invalid trial source")
    }
    if (source === checkout || checkout.startsWith(source + sep) || source.startsWith(checkout + sep)) {
      throw new Error("Trial source overlaps results checkout")
    }
    const sourceRoot = await realpath(source)
    const temp = await mkdtemp(join(tmpdir(), "smithers-benchmark-export-"))
    const stage = join(temp, "trial")
    await mkdir(stage, { mode: 0o700 })
    try {
      const entries: Array<[string, string]> = []
      const copy = async (relative: string) => {
        for (const name of (await readdir(join(source, relative))).sort()) {
          checkCancelled()
          if (excluded(name)) continue
          if (redact(name) !== name) throw new Error("Artifact filename contains credentials")
          const path = join(relative, name)
          const from = join(source, path)
          const stat = await lstat(from)
          if (stat.isSymbolicLink()) throw new Error("Artifact source contains a symlink")
          const physical = await realpath(from)
          if (!physical.startsWith(sourceRoot + sep)) throw new Error("Artifact source escapes its directory")
          if (stat.isDirectory()) {
            await mkdir(join(stage, path), { mode: 0o700 })
            entries.push([path + "/", "directory"])
            await copy(path)
          } else if (stat.isFile()) entries.push([path, await sanitizeFile(from, join(stage, path))])
          else throw new Error("Artifact source contains a special file")
        }
      }
      await copy("")
      const summary = redact(JSON.stringify(trial.summary, null, 2)) + "\n"
      JSON.parse(summary)
      const identity = createHash("sha256").update(JSON.stringify(entries)).update(summary).digest("hex")
      const archive = join(temp, `${id}.tar.zst`)
      await checked("tar", ["--zstd", "-cf", archive, "-C", stage, "."])
      const archiveHandle = await open(archive, "r")
      const archiveHash = createHash("sha256")
      let archiveSize = 0
      try {
        for await (const chunk of archiveHandle.createReadStream({ autoClose: false })) {
          archiveHash.update(chunk)
          archiveSize += chunk.length
        }
      } finally {
        await archiveHandle.close()
      }
      const archiveOid = archiveHash.digest("hex")
      const archivePath = `jobs/${job}/${id}.tar.zst`
      const trialPath = `jobs/${job}/${id}`
      const commit = await locked(() =>
        publish(async () => {
          await assertContained(`${trialPath}/export.json`)
          await assertContained(`${trialPath}/summary.json`)
          await assertContained(archivePath)
          const manifestPath = join(checkout, trialPath, "export.json")
          try {
            const existing = JSON.parse(await readFile(manifestPath, "utf8")) as {
              identity: string
              archiveOid: string
              archiveSize: number
            }
            if (existing.identity !== identity) throw new Error("Immutable trial collision")
            if (await readFile(join(checkout, trialPath, "summary.json"), "utf8") !== summary) {
              throw new Error("Trial summary integrity failure")
            }
            const pointer = await checked("git", ["show", `HEAD:${archivePath}`], checkout)
            if (
              pointer !==
                `version https://git-lfs.github.com/spec/v1\noid sha256:${existing.archiveOid}\nsize ${existing.archiveSize}`
            ) {
              throw new Error("Trial Git LFS archive integrity failure")
            }
            return
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          }
          // Refuse incomplete or unowned existing objects rather than replacing another run's data.
          for (const path of [join(checkout, trialPath), join(checkout, archivePath)]) {
            try {
              await lstat(path)
              throw new Error("Immutable trial collision")
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
            }
          }
          await mkdir(join(checkout, trialPath), { recursive: true })
          await writeFile(join(checkout, trialPath, "summary.json"), summary)
          await writeFile(manifestPath, JSON.stringify({ identity, archiveOid, archiveSize }) + "\n")
          // Stream the compressed archive into the checkout without buffering a multi-GiB object.
          const input = await open(archive, "r")
          const output = await open(join(checkout, archivePath), "wx", 0o600)
          try {
            for await (const chunk of input.createReadStream({ autoClose: false })) await output.write(chunk)
          } finally {
            await Promise.all([input.close(), output.close()])
          }
          await checked("git", ["lfs", "track", "jobs/**/*.tar.zst"], checkout)
        }, `📊 feat(benchmark): export ${job}/${id}`)
      )
      return { commit, path: archivePath }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }

  const writeReports = async (files: Readonly<Record<string, string>>) => {
    const entries = Object.entries(files)
    for (const [name] of entries) {
      if (
        ![
          "report.md",
          "health.md",
          "meter.json",
          "trials.json",
          "report.json",
          "versions.json",
          "input.json",
          "samples.jsonl"
        ].includes(name)
      ) {
        throw new Error("Unsupported benchmark report")
      }
    }
    if (!entries.length) throw new Error("No benchmark reports supplied")
    const commit = await locked(() =>
      publish(async () => {
        await mkdir(join(checkout, "jobs", job), { recursive: true })
        // Reports may be written before the first trial (for example a meter-only run).
        try {
          await lstat(join(checkout, ".gitattributes"))
        } catch {
          await writeFile(join(checkout, ".gitattributes"), "")
        }
        for (const [name, content] of entries) {
          await assertContained(`jobs/${job}/${name}`)
          await writeFile(join(checkout, "jobs", job, basename(name)), redact(content))
        }
      }, `📊 feat(benchmark): reports for ${job}`)
    )
    return { commit }
  }
  const refresh = () => locked(synchronize)
  return { exportTrial, writeReports, refresh }
}
