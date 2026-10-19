// E-7 (EK4402): the Node platform calls approvals.vibe makes, one call each, with the
// names approvals.ts imports, so its plain path, symlink and hash helpers read unchanged.
import * as NodeCrypto from "node:crypto"
import * as NodeFs from "node:fs"
import * as NodePath from "node:path"

export const createHash = (algorithm: string): NodeCrypto.Hash => NodeCrypto.createHash(algorithm)

export const accessSync = (path: string, mode: number): void => NodeFs.accessSync(path, mode)
export const constants: typeof NodeFs.constants = NodeFs.constants
export const lstatSync = (path: string): NodeFs.Stats => NodeFs.lstatSync(path)
export const readFileSync = (path: string): Buffer => NodeFs.readFileSync(path)
export const readlinkSync = (path: string): string => NodeFs.readlinkSync(path)
export const realpathSync: { readonly native: (path: string) => string } = {
  native: (path) => NodeFs.realpathSync.native(path)
}
export const statSync = (path: string): NodeFs.Stats => NodeFs.statSync(path)

export const basename = (path: string): string => NodePath.basename(path)
export const delimiter: string = NodePath.delimiter
export const dirname = (path: string): string => NodePath.dirname(path)
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)
export const join = (...paths: Array<string>): string => NodePath.join(...paths)
export const relative = (from: string, to: string): string => NodePath.relative(from, to)
export const resolve = (...paths: Array<string>): string => NodePath.resolve(...paths)
export const sep: string = NodePath.sep

/** `process.cwd()`. */
export const cwd = (): string => process.cwd()
/** `process.env.PATH`. */
export const envPath = (): string | undefined => process.env.PATH

/** `setInterval(tick, ms)`. */
export const every = (tick: () => void, ms: number): ReturnType<typeof setInterval> => setInterval(tick, ms)
/** `clearInterval(timer)`. */
export const stop = (timer: ReturnType<typeof setInterval>): void => clearInterval(timer)
