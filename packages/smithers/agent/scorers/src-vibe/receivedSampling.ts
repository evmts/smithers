// C-1: hostile ratio inspection must catch defects synchronously.
import type { Sampling } from "./Sampling.vibe"
export const received = (sampling: Sampling): string => {
  try {
    return typeof sampling === "object" && sampling !== null && "ratio" in sampling
      ? `, received ratio ${String(sampling.ratio)}`
      : ""
  } catch {
    return ""
  }
}

