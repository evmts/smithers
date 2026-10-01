// History writes/readback still need real-host receipts: https://github.com/smithersai/smithers/issues/1921.
export const history = [
  // Current human-only PR landing has no real reviewed-head/CI/merge readback scenario.
  "history.land", // owner: #1921
  "history.todo", // owner: #1921
] as const
