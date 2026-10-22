import { Collection } from "@smthrs/effect-tanstack-db"
import { Effect, Exit, Schema, Scope } from "effect"
import { expect, test, vi } from "vitest"
import { Session } from "../auth/schema"
import { adminQuery } from "./queries"

test("cached rows are visible only to a confirmed Admin, including demotion and reauthorization", async () => {
  const scope = Scope.makeUnsafe()
  try {
    const { session, visible } = await Effect.runPromise(Effect.gen(function* () {
      const rows = yield* Collection.local<{ readonly id: string; readonly text: string }, string | number>({
        id: "admin-query-rows", schema: Schema.Struct({ id: Schema.String, text: Schema.String }),
        getKey: (row) => row.id, initialData: [{ id: "kept", text: "private" }],
      })
      const session = yield* Collection.local<Session, string>({
        id: "admin-query-session", schema: Session, getKey: (row) => row.id,
        initialData: [{ id: "session", status: "loading", role: "admin", login: null,
          available: false, signingOut: false, restored: false }],
      })
      const visible = yield* adminQuery(rows, session, { id: Schema.String, text: Schema.String })
      yield* visible.preload
      return { session, visible }
    }).pipe(Scope.provide(scope)))
    expect(visible.tanstack.toArray).toEqual([])
    for (const role of ["admin", "member", "maintainer", "guest", null, "admin"] as const) {
      await Effect.runPromise(session.update("session", (row) => { row.status = "signed_in"; row.role = role }))
      await vi.waitFor(() => expect(visible.tanstack.toArray.map((row) => row.text)).toEqual(role === "admin" ? ["private"] : []))
    }
    await Effect.runPromise(session.update("session", (row) => { row.status = "signed_out" }))
    await vi.waitFor(() => expect(visible.tanstack.toArray).toEqual([]))
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})
