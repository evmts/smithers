import { Uuid, WebCrypto } from "@smthrs/crypto"
import { Config, Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { CONVERSATION_NAMESPACE, HOME_BRANCH, type Mode } from "../../src/features/branch/contract.ts"
import { repoId } from "../../src/features/repo/contract.ts"
import { DEFAULT_REPOSITORY } from "../SignIn.ts"

// The statements behind a branch's conversation (decision 0013 §1, docs/features/branch-workspace.md#postgres): each
// branch has one conversation, whose id is the version 5 UUID of the branch's id, created with the branch in one
// transaction. Everything chat-scoped names its conversation; a request that names none means the home conversation,
// the deployment repository's `main`, which `/app` shows until the launcher lands.

/** A conversation's id: the version 5 UUID of its branch's id in `CONVERSATION_NAMESPACE`. */
export const conversationIdOf = (branchId: string) =>
  Uuid.v5(CONVERSATION_NAMESPACE, branchId.toLowerCase()).pipe(Effect.provide(WebCrypto.layer), Effect.orDie)

/** `GITHUB_REPOSITORY`'s id: the deployment's own repository, whose `main` is the home conversation. */
export const homeRepository = Config.String("GITHUB_REPOSITORY").pipe(
  Config.withDefault(DEFAULT_REPOSITORY),
  Config.map((repository) => {
    const [owner = "", name = ""] = repository.split("/")
    return repoId(owner, name)
  }),
)

/** A tracked branch as the routes answer it. */
export interface Branch {
  readonly branchId: string
  readonly conversationId: string
  readonly repoId: string
  readonly name: string
  readonly mode: Mode
}

const BranchRow = Schema.Struct({
  branchId: Schema.String,
  conversationId: Schema.String,
  repoId: Schema.String,
  name: Schema.String,
  mode: Schema.Literals(["locked", "open", "restricted"]),
})

/** The living branch `name` of repository `repo`, with its conversation, if the app tracks it. */
export const find = (repo: string, name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      SELECT b.id AS "branchId", c.id AS "conversationId", b.repo_id AS "repoId", b.name, b.mode
      FROM branches b JOIN conversations c ON c.branch_id = b.id
      WHERE b.repo_id = ${repo} AND b.name = ${name} AND b.deleted_at IS NULL`
    return rows[0] === undefined ? undefined : yield* Schema.decodeUnknownEffect(BranchRow)(rows[0]).pipe(Effect.orDie)
  })

/** The living branch with id `branchId`, with its conversation. */
export const byId = (branchId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      SELECT b.id AS "branchId", c.id AS "conversationId", b.repo_id AS "repoId", b.name, b.mode
      FROM branches b JOIN conversations c ON c.branch_id = b.id
      WHERE b.id = ${branchId} AND b.deleted_at IS NULL`
    return rows[0] === undefined ? undefined : yield* Schema.decodeUnknownEffect(BranchRow)(rows[0]).pipe(Effect.orDie)
  })

/**
 * Records branch `name` of `repo` with its conversation, in one transaction, unless the app already tracks it: either
 * way, the branch as it is now. Two requests at once record it once.
 */
export const track = (repo: string, name: string, mode: Mode, baseSha: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      const [inserted] = yield* sql<{ readonly id: string }>`
        INSERT INTO branches (id, repo_id, name, mode, base_sha)
        VALUES (gen_random_uuid(), ${repo}, ${name}, ${mode}, ${baseSha})
        ON CONFLICT (repo_id, name) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id`
      if (inserted !== undefined) {
        const conversationId = yield* conversationIdOf(inserted.id)
        yield* sql`
          INSERT INTO conversations (id, repo_id, branch_id) VALUES (${conversationId}, ${repo}, ${inserted.id})`
        return { created: true, branch: { branchId: inserted.id, conversationId, repoId: repo, name, mode } }
      }
      return { created: false, branch: (yield* find(repo, name))! }
    }))
  })

/** The home conversation's id: the deployment repository's `main`, which 0014_branch_workspace records. */
export const home = Effect.gen(function* () {
  const branch = yield* find(yield* homeRepository, HOME_BRANCH)
  return branch?.conversationId
})

/** The conversation `conversationId`, if it exists. */
export const exists = (conversationId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`SELECT 1 FROM conversations WHERE id = ${conversationId}`
    return rows.length > 0
  })
