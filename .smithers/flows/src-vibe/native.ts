// E-7: Node platform primitives the plain (non-Effect) functions of these flows call.
// VibeLang code does not call platform APIs directly (EK4402); each wrapper is one call.
import { existsSync as nodeExistsSync } from "node:fs"
import * as NodePath from "node:path"
import { fileURLToPath as nodeFileURLToPath, pathToFileURL as nodePathToFileURL } from "node:url"

export const existsSync = (path: string): boolean => nodeExistsSync(path)
export const dirname = (path: string): string => NodePath.dirname(path)
export const basename = (path: string, suffix?: string): string => NodePath.basename(path, suffix)
export const join = (...paths: Array<string>): string => NodePath.join(...paths)
export const resolve = (...paths: Array<string>): string => NodePath.resolve(...paths)
export const relative = (from: string, to: string): string => NodePath.relative(from, to)
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)
export const fileURLToPath = (url: string | URL): string => nodeFileURLToPath(url)
export const pathToFileURL = (path: string): URL => nodePathToFileURL(path)
