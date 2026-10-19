// E-7: the Node platform calls land.vibe's plain helpers make (EK4402). One call each.
import { readFileSync as nodeReadFileSync, renameSync as nodeRenameSync, writeFileSync as nodeWriteFileSync } from "node:fs"
import { homedir as nodeHomedir, tmpdir as nodeTmpdir } from "node:os"
import { matchesGlob as nodeMatchesGlob } from "node:path"

export const readText = (path: string): string => nodeReadFileSync(path, "utf8")
export const writeText = (path: string, text: string): void => nodeWriteFileSync(path, text)
export const renameSync = (from: string, to: string): void => nodeRenameSync(from, to)
export const homedir = (): string => nodeHomedir()
export const tmpdir = (): string => nodeTmpdir()
export const matchesGlob = (path: string, pattern: string): boolean => nodeMatchesGlob(path, pattern)
