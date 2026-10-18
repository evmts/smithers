// C-1: caller-owned kind getters can throw synchronously.
import type { Observation } from "./ScoreStore.vibe"
export const observationLabel = (observation: Observation): string => {
  try {
    const kind = String(observation.kind)
    return `${kind === "inconclusive" ? "An" : "A"} ${kind} observation`
  } catch {
    return "An observation"
  }
}

