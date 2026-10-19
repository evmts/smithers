// E-7/EK4402: node:path, node:fs, node:crypto and node:url are Node platform APIs, which
// VibeLang code does not call directly. NodeLanguageServer.vibe keeps its logic and
// calls these one-line wrappers, each the Node call NodeLanguageServer.ts makes.
import { createHash } from "node:crypto"
import * as NodeFs from "node:fs"
import * as NodePath from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const sep = NodePath.sep
export const delimiter = NodePath.delimiter
export const extname = (path: string): string => NodePath.extname(path)
export const basename = (path: string): string => NodePath.basename(path)
export const resolve = (...paths: Array<string>): string => NodePath.resolve(...paths)
export const relative = (from: string, to: string): string => NodePath.relative(from, to)
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)
export const stat = (path: string): NodeFs.Stats | undefined => NodeFs.statSync(path, { throwIfNoEntry: false })
export const realpath = (path: string): string => NodeFs.realpathSync(path)
export const accessExecutable = (path: string): void => NodeFs.accessSync(path, NodeFs.constants.X_OK)
export const readText = (path: string): string => NodeFs.readFileSync(path, "utf8")
export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex")
export const fileUrl = (path: string): string => pathToFileURL(path).href
export const filePath = (uri: string): string => fileURLToPath(uri)
export const processEnv = (): Readonly<Record<string, string | undefined>> => process.env
