import type { Assertion } from "./journey"
/** PM journeys.md: Monday never promises agent review or landing. */
export const mondayClaim: ReadonlyArray<Assertion> = [
  ...["Smithers reviews", "Smithers merges", "Smithers lands", "lands it for you", "merges for you", "ready to merge"].map(absent => ({ absent })),
  { absent: { pattern: "\\b(?:reviews?|merges?|lands?)\\s+(?:(?:it|changes?|code)\\s+)?for\\s+you\\b" } }
]
