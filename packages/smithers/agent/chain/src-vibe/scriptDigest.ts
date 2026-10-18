// D-2: synchronous sibling TypeScript digest.
import * as Digest from "@smthrs/core/Digest"
import type { Script } from "./Script.vibe"
export const makeImpl = (text: string): Script => ({ text, digest: Digest.digest(text) })
