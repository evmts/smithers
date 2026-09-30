// Main-only secrets (D-24): seam and backend tests cover it; the real backend run is owed.
export const secrets = [
  "secrets.connect.codex", // owner: #1879
  "secrets.move", // owner: #1879
  "secrets.scope", // owner: #2458
] as const
