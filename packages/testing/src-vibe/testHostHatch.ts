// E-5 (D38): makeMemoryFs and makeStubBash implement foreign Promise-returning
// interfaces (ZenFS, just-bash) for TypeScript callers, with async methods and,
// for the stub's delay, ambient setTimeout (E-7, EK4402). VibeLang has no async,
// so these two factories stay in TypeScript.
import type * as BrowserChildProcessSpawner from "@smthrs/platform-browser/BrowserChildProcessSpawner"
import type * as BrowserFileSystem from "@smthrs/platform-browser/BrowserFileSystem"

/** POSIX-normalize so `/a/b`, `/a/b/`, and `/a/./b` are one key in the store. */
const normalize = (path: string): string => {
  const parts: Array<string> = []
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return `/${parts.join("/")}`
}

const enoent = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" })

interface Entry {
  readonly type: "file" | "directory"
  readonly data: Uint8Array
}

export const makeMemoryFs = (
  initial?: Readonly<Record<string, string>>
): BrowserFileSystem.ZenFsPromisesLike => {
  const entries = new Map<string, Entry>([
    ["/", { type: "directory", data: new Uint8Array() }],
    ["/tmp", { type: "directory", data: new Uint8Array() }]
  ])
  const encoder = new TextEncoder()

  const mkdirp = (path: string): void => {
    const parts = normalize(path).split("/").filter((p) => p !== "")
    let current = ""
    for (const part of parts) {
      current = `${current}/${part}`
      if (!entries.has(current)) entries.set(current, { type: "directory", data: new Uint8Array() })
    }
  }

  const put = (path: string, data: Uint8Array): void => {
    const key = normalize(path)
    mkdirp(key.replace(/\/[^/]*$/, "") || "/")
    entries.set(key, { type: "file", data: data.slice() })
  }

  for (const [path, contents] of Object.entries(initial ?? {})) put(path, encoder.encode(contents))

  const get = (path: string): Entry => {
    const entry = entries.get(normalize(path))
    if (entry === undefined) throw enoent(path)
    return entry
  }

  return {
    open: async (path) => {
      const entry = get(path)
      if (entry.type !== "file") throw enoent(path)
      return {
        read: async (buffer, offset, length, position) => {
          const bytesRead = Math.min(length, Math.max(0, entry.data.length - position))
          if (bytesRead > 0) {
            buffer.set(entry.data.subarray(position, position + bytesRead), offset)
          }
          return { bytesRead }
        },
        close: async () => {}
      }
    },
    readFile: async (path) => {
      const entry = get(path)
      if (entry.type !== "file") throw enoent(path)
      return entry.data.slice()
    },
    writeFile: async (path, data, options) => {
      if (options?.flag === "wx" && entries.has(normalize(path))) {
        throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" })
      }
      put(path, data)
    },
    mkdir: async (path, options) => {
      if (options?.recursive === true) mkdirp(path)
      else {
        const key = normalize(path)
        if (entries.has(key)) throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" })
        const parent = entries.get(key.replace(/\/[^/]*$/, "") || "/")
        if (parent === undefined) throw enoent(path)
        if (parent.type !== "directory") throw Object.assign(new Error(`ENOTDIR: ${path}`), { code: "ENOTDIR" })
        entries.set(key, { type: "directory", data: new Uint8Array() })
      }
    },
    readdir: async (path) => {
      const dir = normalize(path)
      if (get(dir).type !== "directory") throw enoent(path)
      const prefix = dir === "/" ? "/" : `${dir}/`
      const names = new Set<string>()
      for (const key of entries.keys()) {
        if (key === dir || !key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        const slash = rest.indexOf("/")
        names.add(slash === -1 ? rest : rest.slice(0, slash))
      }
      return [...names].sort()
    },
    realpath: async (path) => {
      get(path)
      return normalize(path)
    },
    stat: async (path) => {
      const entry = get(path)
      return {
        size: entry.data.byteLength,
        mode: entry.type === "directory" ? 0o040755 : 0o100644,
        /** Fixed epoch: file metadata must never make a test flaky. */
        mtimeMs: 0,
        isFile: () => entry.type === "file",
        isDirectory: () => entry.type === "directory",
        isSymbolicLink: () => false
      }
    },
    rm: async (path, options) => {
      const key = normalize(path)
      if (!entries.has(key)) {
        if (options?.force === true) return
        throw enoent(path)
      }
      const prefix = key === "/" ? "/" : `${key}/`
      if (
        entries.get(key)?.type === "directory" && options?.recursive !== true &&
        [...entries.keys()].some((other) => other !== key && other.startsWith(prefix))
      ) {
        throw Object.assign(new Error(`ENOTEMPTY: ${path}`), { code: "ENOTEMPTY" })
      }
      entries.delete(key)
      if (options?.recursive === true) {
        for (const other of [...entries.keys()]) {
          if (other.startsWith(prefix)) entries.delete(other)
        }
      }
    }
  }
}

export const makeStubBash = (
  responses?: Readonly<
    Record<string, {
      stdout?: string
      stderr?: string
      exitCode?: number
      delayMs?: number
      pending?: boolean
    }>
  >
): BrowserChildProcessSpawner.JustBashLike => ({
  exec: async (command, options) => {
    const scripted = responses !== undefined && Object.hasOwn(responses, command) ? responses[command] : undefined
    if (scripted === undefined) {
      return { stdout: "", stderr: `command not found: ${command}\n`, exitCode: 127 }
    }
    if (scripted.delayMs !== undefined) {
      // Ambient `setTimeout` on purpose: this stub implements a foreign
      // promise-returning interface (`JustBashLike`), so there is no Effect
      // fiber here to sleep on `Clock`. The delay exists only to make a
      // scripted command observably slow to its caller.
      await new Promise((resolve) => setTimeout(resolve, scripted.delayMs))
    }
    if (scripted.pending === true) {
      await new Promise<never>((_resolve, reject) => {
        const signal = options?.signal
        if (signal?.aborted === true) {
          reject(signal.reason)
          return
        }
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    }
    return {
      stdout: scripted.stdout ?? "",
      stderr: scripted.stderr ?? "",
      exitCode: scripted.exitCode ?? 0
    }
  }
})

