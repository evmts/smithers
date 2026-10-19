// E-7: the Node platform calls disk.vibe makes (EK4402). One call each.
import { statfsSync as nodeStatfsSync, type StatsFs } from "node:fs"
import { homedir as nodeHomedir, tmpdir as nodeTmpdir } from "node:os"

export const statfsSync = (path: string): StatsFs => nodeStatfsSync(path)
export const homedir = (): string => nodeHomedir()
export const tmpdir = (): string => nodeTmpdir()
