// E-7 (EK4402): node:fs and node:path are platform APIs that VibeLang code
// does not call directly. Init.vibe scaffolds through these, each a direct
// forward to the node function Init.ts calls.
import * as fs from "node:fs"
import * as path from "node:path"

/** `path.dirname`. */
export const dirname = (value: string): string => path.dirname(value)

/** `path.isAbsolute`. */
export const isAbsolute = (value: string): boolean => path.isAbsolute(value)

/** `path.join`. */
export const join = (...values: Array<string>): string => path.join(...values)

/** `fs.existsSync`. */
export const existsSync = (file: string): boolean => fs.existsSync(file)

/** `fs.lstatSync`. */
export const lstatSync = (file: string): fs.Stats => fs.lstatSync(file)

/** `fs.mkdirSync`. */
export const mkdirSync = (directory: string, options: fs.MakeDirectoryOptions & { readonly recursive: true }) =>
  fs.mkdirSync(directory, options)

/** `fs.readFileSync` as text. */
export const readFileSync = (file: string, encoding: "utf8"): string => fs.readFileSync(file, encoding)

/** `fs.writeFileSync` of text. */
export const writeFileSync = (file: string, data: string, options: fs.WriteFileOptions): void =>
  fs.writeFileSync(file, data, options)
