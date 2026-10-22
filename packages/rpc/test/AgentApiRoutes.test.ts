import { describe, expect, test } from "vitest"
import { publicRepoActivityPath, PublicRepositoryNameRejected } from "../src/AgentApiRoutes.ts"

describe("public repository activity paths (unit)", () => {
  test("invalid names fail with a tagged error without copying repository text", () => {
    expect(() => publicRepoActivityPath("owner/private?token=value")).toThrow(PublicRepositoryNameRejected)
    const error = new PublicRepositoryNameRejected()
    expect(error).toMatchObject({ _tag: "PublicRepositoryNameRejected", code: "invalid_repository" })
    expect(error.message).toBe("Invalid public repository name")
  })
  test.each([
    ["smithersai/smithers", "/api/public/repos/smithersai/smithers/activity"],
    ["WillCory/my.repo", "/api/public/repos/WillCory/my.repo/activity"],
    ["my-team/my_repo", "/api/public/repos/my-team/my_repo/activity"]
  ])("formats repository %s without changing its owner or name", (repo, expected) => {
    expect(publicRepoActivityPath(repo)).toBe(expected)
  })
})

test("retired browser write routes are absent while private archive reads remain", async () => {
  const routes = await import("../src/AgentApiRoutes.ts")
  for (const name of ["TURN_PATH", "CANCEL_PATH", "TURN_RETIRE_PATH", "CHAT_TURN_PATH", "CHAT_CANCEL_PATH"]) {
    expect(routes).not.toHaveProperty(name)
  }
  expect(routes.TURN_REPLAY_PATH).toBe("/api/agent/turn/replay")
  expect(routes.CONVERSATIONS_PATH).toBe("/api/agent/conversations")
  expect(routes.CONVERSATION_REPLAY_PATH).toBe("/api/agent/conversations/replay")
  expect(routes.TURN_ERASE_PATH).toBe("/api/agent/turn/erase")
})
