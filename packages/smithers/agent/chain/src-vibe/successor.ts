// D-2: preserve synchronous sibling TypeScript script construction.
import * as Script from "../src/Script.ts"
import type { To } from "./Outcome.vibe"
export const toImpl = (script: Script.Script): To => ({ _tag: "To", script: Script.make(script.text) })
