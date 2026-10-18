import { expect, test } from "bun:test"
import { memoryStorage } from "./TestFixtures"
import { createAppStore } from "./AppStore"
import { bindGatewayHost, gatewayBindingFor, resolveTargetRepo, knownRepositories } from "./RepoContext"
import { isGatewayWorkspaceId } from "@smthrs/rpc/GatewayWorkspace"
import { CardSchema } from "@smthrs/rpc/Cards"

// The explicit host binding wins over stale persisted hosted selections.
test("a local host resolves only its bound repo and accepts serve's persisted workspace hash", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const other = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  try {
    await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "hosted/stale", org: "hosted", ownerKind: "user", name: "stale", head: null }] }).isPersisted.promise
    await store.dispatch({ type: "repo.selected", actor: "user", id: "hosted/stale" }).isPersisted.promise
    bindGatewayHost(store, { repo: "local/project", workspaceId: "da0af0dc9537250e" })
    expect(resolveTargetRepo(store, undefined)).toEqual({ repo: "local/project" })
    expect(resolveTargetRepo(store, "other/repo")).toHaveProperty("error")
    expect(knownRepositories(store).has("local/project")).toBe(true)
    expect(knownRepositories(store).has("hosted/stale")).toBe(false)
    expect(gatewayBindingFor(store, "local/project")).toEqual({ workspaceId: "da0af0dc9537250e" })
    expect(gatewayBindingFor(store, "other/repo")).toHaveProperty("error")
    expect(gatewayBindingFor(other, "local/project")).toHaveProperty("error")
    expect(isGatewayWorkspaceId("da0af0dc9537250e")).toBe(true)
    for (const id of ["hash", "DA0AF0DC9537250E", "da0af0dc9537250", "00000000-0000-0000-0000-000000000000"]) expect(isGatewayWorkspaceId(id)).toBe(false)
    expect(isGatewayWorkspaceId("12345678-1234-1234-1234-123456789abc")).toBe(true)
    const persisted = JSON.stringify({ id: "inbox", title: "Approvals", createdAt: 1, ordinal: 1, status: "active", kind: "approvals-inbox", payload: { repo: "local/project", workspaceId: "da0af0dc9537250e", approvals: [] } })
    expect(CardSchema.parse(JSON.parse(persisted)).payload).toHaveProperty("workspaceId", "da0af0dc9537250e")
  } finally {
    await store.dispose?.()
    await other.dispose?.()
  }
})
