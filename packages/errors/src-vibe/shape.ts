// Plain TypeScript hatch for the VibeLang twin. VibeLang 0.0.1's catch rethrows
// defects even in a plain function, and this refinement must answer false when
// inspecting a hostile value throws. Remove once D260 ships (effectscript-4a).
import { isSmithersErrorCode } from "./ErrorCode.vibe"
import type { SmithersError } from "./SmithersError.vibe"

export const hasSmithersErrorShapeImpl = (value: unknown): value is SmithersError => {
  try {
    if (!(value instanceof Error)) return false
    const details = (value as SmithersError).details
    return isSmithersErrorCode((value as SmithersError).code) &&
      typeof (value as SmithersError).summary === "string" &&
      typeof (value as SmithersError).docsUrl === "string" &&
      (details === undefined || (typeof details === "object" && details !== null && !Array.isArray(details)))
  } catch {
    return false
  }
}
