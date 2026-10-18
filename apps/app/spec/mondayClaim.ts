import type { Assertion } from "./journey"
/** PM journeys.md: Monday never promises agent review or landing. */
export const mondayClaim: ReadonlyArray<Assertion> = [
  ...[
    "Smithers reviews",
    "Smithers merges",
    "Smithers lands",
    "lands it for you",
    "merges for you",
    "ready to merge"
  ].map((absent) => ({ absent })),
  { rubric: "claims-honest", on: { view: "page" } }
]
