/**
 * E-7/EK4402: `process`, `node:child_process`'s `spawnSync`, `node:os` and
 * `node:path`'s `win32` are platform APIs, which VibeLang code does not call
 * directly. `ProcessReaper.vibe` asks the operating system through these; each
 * `spawnSync` call is the source's own call, argv and options byte for byte,
 * and `ProcessReaper.vibe` reads its answer.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { uptime } from "node:os"
import { parse, win32 } from "node:path"

/**
 * `process.kill(target, signal)`; throws what the kernel answers.
 * @vibelang trusted
 */
export const kill = (target: number, signal: NodeJS.Signals | 0): void => {
  process.kill(target, signal)
}

/**
 * `process.pid`.
 * @vibelang trusted
 */
export const pid = (): number => process.pid

/**
 * `process.platform`.
 * @vibelang trusted
 */
export const hostPlatform = (): string => process.platform

/**
 * `os.uptime()`, in seconds.
 * @vibelang trusted
 */
export const uptimeSeconds = (): number => uptime()

/**
 * `process.env[name]`.
 * @vibelang trusted
 */
export const environmentVariable = (name: string): string | undefined => process.env[name]

/**
 * `path.win32.isAbsolute(path)`.
 * @vibelang trusted
 */
export const isWin32Absolute = (path: string): boolean => win32.isAbsolute(path)

/**
 * `path.win32.join(...segments)`.
 * @vibelang trusted
 */
export const win32Join = (...segments: Array<string>): string => win32.join(...segments)

/**
 * One `ps` column for one pid, as the source's `ps` asks it.
 * @vibelang trusted
 */
export const psColumn = (executable: string, column: string, pid: number, timeoutMs: number): SpawnSyncReturns<string> =>
  spawnSync(executable, ["-o", `${column}=`, "-p", String(pid)], {
    encoding: "utf8",
    timeout: timeoutMs,
    // `SIGKILL` rather than the default `SIGTERM`, because this call blocks the
    // event loop while a host is being built.
    killSignal: "SIGKILL",
    // Pin both the column's spelling and its timezone.
    env: { LC_ALL: "C", TZ: "UTC", PATH: "/usr/bin:/bin" }
  })

/**
 * The fixed-path whole-table snapshot the source's `psGroupSnapshot` reads.
 * @vibelang trusted
 */
export const psTable = (executable: string, timeoutMs: number): SpawnSyncReturns<string> =>
  spawnSync(executable, ["-A", "-o", "pid=,pgid=,stat=,lstart="], {
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    env: { LC_ALL: "C", TZ: "UTC", PATH: "/usr/bin:/bin" }
  })

/**
 * The native helper's Windows process-identity query.
 * @vibelang trusted
 */
export const processInfo = (executable: string, pid: number, timeoutMs: number): SpawnSyncReturns<string> =>
  spawnSync(executable, ["--process-info", String(pid)], {
    cwd: parse(process.execPath).root,
    env: {},
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 4096
  })

/**
 * `taskkill /pid <pid> /T /F`, with an inert cwd and only `SystemRoot`.
 * @vibelang trusted
 */
export const taskkill = (executable: string, pid: number, systemRoot: string): SpawnSyncReturns<Buffer> =>
  spawnSync(executable, ["/pid", String(pid), "/T", "/F"], {
    // An inert cwd and only the variable Windows system binaries need.
    cwd: parse(process.execPath).root,
    env: { SystemRoot: systemRoot },
    stdio: "ignore"
  })
