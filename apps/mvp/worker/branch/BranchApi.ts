import { Effect, type Layer } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import type { SqlClient } from "effect/sql"
import { BRANCHES_ROUTE } from "../../src/features/branch/contract.ts"
import { TERMINALS_ROUTE, TERMINALS_SHAPE_ROUTE } from "../../src/features/terminal/contract.ts"
import * as Branches from "./Branches.ts"
import * as Terminals from "./Terminals.ts"

// The branch workspace's routes (decision 0013, docs/features/branch-workspace.md): tracking a branch, and its
// terminals. ChatApi hands them every request `handles` names; the conversation's own routes stay chat's.

/** Whether a path is one of the branch workspace's routes. */
export const handles = (path: string): boolean =>
  path === BRANCHES_ROUTE || path === TERMINALS_ROUTE || path === TERMINALS_SHAPE_ROUTE ||
  path.startsWith(`${TERMINALS_ROUTE}/`)

/** The routes over `database`, which opens a Postgres client for each request's scope. */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const terminals = yield* Terminals.make(database)
    const fetch = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const path = request.url.split("?")[0]!
      if (path === BRANCHES_ROUTE) return yield* Branches.make(database)
      if (path === TERMINALS_ROUTE) return yield* terminals.open
      if (path === TERMINALS_SHAPE_ROUTE) return yield* terminals.shape
      if (path.startsWith(`${TERMINALS_ROUTE}/`)) return yield* terminals.connect(path.slice(TERMINALS_ROUTE.length + 1))
      return HttpServerResponse.empty({ status: 404 })
    })
    return { fetch }
  })
