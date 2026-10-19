// E-7: node:crypto's createHash is a platform call (EK4402); wrapped/prompt's sha256 is this one call.
import { createHash } from "node:crypto"

export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")
