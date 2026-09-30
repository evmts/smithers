// Resume reuses the reviewed registration; authenticated host acceptance remains #1939.
export const triggers = [
  "triggers.approve", // owner: #1878
  "triggers.pause", // owner: #1878
  "triggers.resume", // owner: #2458
  "triggers.run", // owner: #1878
] as const
