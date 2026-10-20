import { expect, it } from "vitest"
import { isGitLockContention } from "../src/index.ts"

it("classifies only confirmed shared index and ref contention without executing work", () => {
  for (
    const message of [
      "Could not acquire lock for index file: could not be obtained immediately after 1 attempt(s). '/git/index.lock'",
      ...["File exists", "another Git process", "reference already locked"].map((detail) =>
        `cannot lock ref 'refs/heads/main': ${detail}`
      )
    ]
  ) expect(isGitLockContention({ message })).toBe(true)
  for (
    const message of [
      "source conflict in index.lock",
      "Could not acquire lock for index file: could not be obtained immediately after 1 attempt(s). '/git/private.index.lock'",
      "Could not acquire lock for index file: '/git/index.lock': permission denied",
      "cannot lock ref 'refs/heads/main': permission denied",
      "cannot lock ref 'refs/heads/main': is at abc but expected def",
      "invalid revision"
    ]
  ) expect(isGitLockContention({ message })).toBe(false)
})
