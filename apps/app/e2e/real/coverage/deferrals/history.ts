// History writes/readback still need real-host receipts: https://github.com/smithersai/smithers/issues/1921.
export const history = [
  "history.bootstrap", // owner: #1876
  "history.backfill", // owner: #1921
  "history.parallel", // owner: #1921
  "history.retry", // owner: #1921
  "history.show", // owner: #1921
  "history.todo", // owner: #1921
] as const
