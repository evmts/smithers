// E-7/EK4402: node:crypto and node:path are platform APIs that VibeLang code
// does not call directly, so the receipt file name and operation id stay here.
import { createHash, randomUUID } from "node:crypto"
import { join } from "node:path"

export const receiptFile = (directory: string, runId: string): string =>
  join(directory, createHash("sha256").update(runId).digest("hex") + ".json")

export const uuid = (): string => randomUUID()
