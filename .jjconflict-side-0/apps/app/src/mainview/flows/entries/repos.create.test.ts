import { expect, test } from "bun:test"
import { createCommandRegistry } from "../Commands"
import { stubCommandActions } from "../StubCommandActions"

/*
 * The launcher's Create door, at the registry boundary (M-45).
 *
 * Root's 2026-10-16 review: `repos.create` summarised itself as a GitHub
 * repository while its handler ran `RepositoriesSeam.createRepository`
 * (`POST /api/user/repos`), which writes a Smithers Cloud repository row and
 * calls GitHub NEVER. The door now runs the backend's real GitHub create
 * (`createGitHubRepository` -> `POST /api/user/github-repos`), and the Cloud
 * create stays the separate native act.
 *
 * `stubCommandActions` throws for every action a test does not supply, so a
 * handler that went back to the Cloud create fails here rather than
 * reporting a Smithers repository as a GitHub one.
 */
const snapshot = { surface: "chat" as const, typing: false, hasConnectors: true, admin: false, signedOut: false }

const registry = (createGitHubRepository: (name: string) => Promise<string | { readonly value: string }>) =>
  createCommandRegistry(stubCommandActions({
    repositoryFlows: () => undefined,
    knownRepositories: () => new Set<string>(),
    snapshot: () => snapshot,
    noteCommandRun: () => {},
    traceFlow: () => {},
    createGitHubRepository
  }))

test("create runs the GitHub create with the trimmed name, and reports its answer", async () => {
  const names: Array<string> = []
  const commands = registry(async (name) => {
    names.push(name)
    return { value: "Created octo/widget on GitHub. Smithers hasn't imported it yet — open /octo/widget to import it." }
  })
  const outcome = await commands.run("repos.create", "  widget  ")
  expect(names).toEqual(["widget"])
  expect(outcome).toEqual({
    status: "executed",
    value: "Created octo/widget on GitHub. Smithers hasn't imported it yet — open /octo/widget to import it."
  })
})

test("the create's refusal is the one the person reads, unchanged", async () => {
  const commands = registry(async () => "Your GitHub account already has a repository named widget. Nothing was created.")
  const outcome = await commands.run("repos.create", "widget")
  /* A refusal is a failed outcome carrying the create's own sentence. */
  expect(outcome).toMatchObject({
    status: "failed",
    error: "Your GitHub account already has a repository named widget. Nothing was created."
  })
})

test("a name GitHub cannot carry never reaches the create", async () => {
  const commands = registry(async () => { throw new Error("no create for an invalid name") })
  for (const args of ["", "   ", "owner/widget", "a name"]) {
    const outcome = await commands.run("repos.create", args)
    expect(outcome.status).not.toBe("executed")
  }
})
