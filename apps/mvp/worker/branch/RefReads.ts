import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import { REPOSITORY_GRANTEE } from "../../src/features/branch/contract.ts"
import type { Actor } from "../Actor.ts"
import { accessOf, canView, type Grants } from "./Access.ts"

/** Ephemeral names this viewer can discover, under the same policy as sharing and presence. */
export const visible = (repo: string, actor: Option.Option<Actor>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const person = Option.isSome(actor) ? actor.value.subject.id : ""
    const rows = yield* sql<Grants & { readonly name: string }>`
      SELECT b.name, b.created_by AS "createdBy",
        (SELECT access FROM branch_shares s WHERE s.branch_id = b.id AND s.grantee = ${person}
          AND ${person} <> ${REPOSITORY_GRANTEE}) AS person,
        (SELECT access FROM branch_shares s WHERE s.branch_id = b.id AND s.grantee = ${REPOSITORY_GRANTEE}) AS repository
      FROM branches b WHERE b.repo_id = ${repo} AND b.ref_namespace = 'ephemeral'
        AND b.deleted_at IS NULL ORDER BY b.name`
    return rows.filter((row) => canView(accessOf(actor, row))).map((row) => row.name)
  })
