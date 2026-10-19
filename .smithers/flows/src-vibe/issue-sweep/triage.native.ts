// E-7: the Node platform calls triage.vibe's plain helpers make (EK4402). One call each.
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex")
export const readText = (path: string): Promise<string> => readFile(path, "utf8")
