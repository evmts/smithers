/*
 * The GUI binds the shared app operations (#2125): each GUI flow of a shared
 * namespace is the shared declaration plus a controller handler, never a
 * second copy of its name, input or rules.
 */
import { describe, expect, test } from "bun:test"
import { accountOperations } from "@smthrs/ui/app-operations/account"
import { accountFlows } from "./entries/account"
import { createAppStore } from "../state/AppStore"
import { createAppController } from "../state/AppController"
import { memoryStorage, unavailableAgent, waitFor } from "../state/TestFixtures"
import { wikiOperations, wikiSurfaceOperations } from "@smthrs/ui/app-operations/wiki"
import { bind, type AppOperation, type CommandActions } from "./entries/Declare"
import { wikiFlows, wikiSurfaceFlows } from "./entries/wiki"
import { nameOf } from "./registry"

/** Handlers are never called here: binding reads only the declarations. */
const unused = {} as CommandActions

const bound = [...wikiSurfaceFlows(unused), ...wikiFlows(unused)]
const shared: ReadonlyArray<AppOperation> = [...wikiSurfaceOperations, ...wikiOperations]

describe("GUI wiki flows", () => {
  test("register exactly the shared operations, in their order", () => {
    expect(bound.map(nameOf)).toEqual(shared.map((declared) => declared.name))
  })

  test("take their input schema from the shared declaration", () => {
    bound.forEach((entry, index) => expect(entry.input).toBe(shared[index]!.input))
  })

  test("carry the shared rules as their catalog metadata", () => {
    bound.forEach((entry, index) => {
      const { name: _name, input: _input, userOnly: _userOnly, ...rules } = shared[index]!
      expect(entry.metadata).toEqual(rules)
    })
  })

  test("disclose to the model exactly the operations that are not user-only", () => {
    bound.forEach((entry, index) =>
      expect(entry.binding.descriptor.modelInvocable).toBe(shared[index]!.userOnly !== true))
  })
})

describe("bind", () => {
  test("rejects a handler map that misses an operation or names one that does not exist", () => {
    const stale = { wiki: () => {}, "wiki.obsolete": () => {} }
    const check = () => {
      // @ts-expect-error: a handler for a removed operation does not compile
      bind(wikiSurfaceOperations, stale)
      // @ts-expect-error: an operation without a handler does not compile
      bind(wikiSurfaceOperations, {})
    }
    expect(typeof check).toBe("function")
  })

  test("throws when a list widened past its names reaches an operation without a handler", () => {
    const widened: ReadonlyArray<AppOperation> = wikiSurfaceOperations
    expect(() => bind(widened, {})).toThrow("No GUI handler for the wiki operation.")
  })
})

describe("GUI account operation", () => {
  test("binds the shared schema and identity rules without adding a signed-in requirement", () => {
    const entries = accountFlows(unused)
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    const declared = accountOperations[0]
    expect(nameOf(entry)).toBe(declared.name)
    expect(entry.input).toBe(declared.input)
    expect(entry.metadata).toEqual({ summary: "Show account", runtime: ["identity"] })
    expect(entry.binding.descriptor.modelInvocable).toBe(true)
    const check = () => {
      // @ts-expect-error: the shared operation still requires its exact GUI handler
      bind(accountOperations, {})
      // @ts-expect-error: an unrelated handler cannot silently replace account.show
      bind(accountOperations, { "account.obsolete": () => {} })
    }
    expect(typeof check).toBe("function")
  })

  for (const signedIn of [false, true]) {
    for (const actor of ["user", "agent"] as const) {
      test(`${actor} uses the current account controller while ${signedIn ? "signed in" : "signed out"}`, async () => {
        const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
        const controller = createAppController(store, unavailableAgent, {
          bootstrap: {
            apiVersion: 1,
            host: "local",
            version: "test",
            buildSha: "test",
            capabilities: ["identity"],
            authFlow: "credentials",
            sandbox: null
          },
          applicationIdentity: {
            current: async () => signedIn ? { username: "account-owner", admin: false, scopes: null } : null
          }
        })
        try {
          await controller.loadSession()
          await waitFor(() =>
            store.collections.identitySessions.get("identity")?.state === (signedIn ? "signed-in" : "signed-out")
          )
          const before = new Set(store.collections.transitions.keys())
          const result = await controller.commands.submit({ name: "account.show", payload: {}, actor })
          expect(result.status).toBe("executed")
          await store.settled?.()
          const card = store.collections.cards.get("account")
          if (signedIn) {
            expect(card?.kind).toBe("account")
            expect(card?.kind === "account" ? card.payload : null).toMatchObject({
              login: "account-owner",
              provider: "local",
              scopes: []
            })
            const writes = [...store.collections.transitions.values()].filter((event) =>
              event.type === "card.upsert" && !before.has(event.id)
            )
            expect(writes.map((event) => event.actor)).toEqual([actor === "agent" ? "smithers" : "user"])
          } else {
            expect(card).toBeUndefined()
            expect([...store.collections.messages.values()].some((message) => message.text.includes("Sign in"))).toBe(
              true
            )
          }
        } finally {
          try {
            await controller.dispose()
          } finally {
            await store.dispose?.()
          }
        }
      })
    }
  }

  test("a host without identity neither registers nor invokes account.show", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      bootstrap: {
        apiVersion: 1,
        host: "local",
        version: "test",
        buildSha: "test",
        capabilities: [],
        authFlow: "none",
        sandbox: null
      }
    })
    try {
      expect(controller.commands.find("account.show")).toBeUndefined()
      const before = new Set(store.collections.transitions.keys())
      for (const actor of ["user", "agent"] as const) {
        const result = await controller.commands.submit({ name: "account.show", payload: {}, actor })
        expect(result.status).toBe("unavailable")
      }
      expect(store.collections.cards.has("account")).toBe(false)
      expect(
        [...store.collections.transitions.values()].filter((event) =>
          event.type === "card.upsert" && !before.has(event.id)
        )
      ).toEqual([])
    } finally {
      try {
        await controller.dispose()
      } finally {
        await store.dispose?.()
      }
    }
  })
})
