// E-7 (EK4402): readFileSync is a platform API; replay.vibe reads the recording where replay.ts does.
import { readFileSync } from "node:fs"

/** `readFileSync(path, "utf8")`. */
export const readText = (path: string): string => readFileSync(path, "utf8")
