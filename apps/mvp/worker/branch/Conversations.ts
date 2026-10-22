import { Uuid, WebCrypto } from "@smthrs/crypto"
import { Config, Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { CONVERSATION_NAMESPACE, HOME_BRANCH, type Mode, REPOSITORY_GRANTEE } from "../../src/features/branch/contract.ts"
import { repoId } from "../../src/features/repo/contract.ts"
import { DEFAULT_REPOSITORY } from "../SignIn.ts"

// The statements behind a branch's conversation (decision 0013 §1, docs/features/branch-workspace.md#postgres): each
// branch has one conversation, whose id is the version 5 UUID of the branch's id, created with the branch in one
// transaction. Everything chat-scoped names its conversation; a request that names none means the home conversation,
// the deployment repository's `main`, which `/app` shows until the launcher lands. A branch a person tracks is theirs,
// private until they share it; a branch with no creator, such as the default branch, is the team's: anyone in the
// repository with the link may edit it (docs/features/branch-workspace.md#sharing).

/** A conversation's id: the version 5 UUID of its branch's id in `CONVERSATION_NAMESPACE`. */
export const conversationIdOf = (branchId: string) =>
  Uuid.v5(CONVERSATION_NAMESPACE, branchId.toLowerCase()).pipe(Effect.provide(WebCrypto.layer), Effect.orDie)

/** `GITHUB_REPOSITORY`'s id: the deployment's own repository, whose `main` is the home conversation. */
export const homeRepositoryNames = Config.String("GITHUB_REPOSITORY").pipe(
  Config.withDefault(DEFAULT_REPOSITORY),
  Config.map((repository) => {
    const [owner = "", name = ""] = repository.split("/")
    return { owner, name }
  }),
)

/** `GITHUB_REPOSITORY`'s id. */
export const homeRepository = homeRepositoryNames.pipe(Config.map(({ owner, name }) => repoId(owner, name)))

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

/**
 * Records branch `name` of `repo` with its conversation, in one transaction, unless the app already tracks it: either
 * way, the branch as it is now. Two requests at once record it once. `createdBy` owns it, private until they share it;
 * without one, or for a `locked` branch, it is the team's: anyone in the repository with the link may edit it.
 * `createRequest` is the request that made it, when one did (`conversation/new`).
 */
export const track = (
  repo: string,
  name: string,
  mode: Mode,
  baseSha: string,
  createdBy?: string,
  createRequest?: string,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const owner = mode === "locked" ? null : createdBy ?? null
    return yield* sql.withTransaction(Effect.gen(function* () {
      const [inserted] = yield* sql<{ readonly id: string }>`
        INSERT INTO branches (id, repo_id, name, mode, base_sha, created_by, create_request)
        VALUES (gen_random_uuid(), ${repo}, ${name}, ${mode}, ${baseSha}, ${owner}, ${createRequest ?? null})
        ON CONFLICT (repo_id, name) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id`
      if (inserted !== undefined) {
        const conversationId = yield* conversationIdOf(inserted.id)
        yield* sql`
          INSERT INTO conversations (id, repo_id, branch_id) VALUES (${conversationId}, ${repo}, ${inserted.id})`
        if (owner === null) {
          yield* sql`
            INSERT INTO branch_shares (branch_id, grantee, access) VALUES (${inserted.id}, ${REPOSITORY_GRANTEE}, 'edit')`
        }
        return { created: true, branch: { branchId: inserted.id, conversationId, repoId: repo, name, mode } }
      }
      return { created: false, branch: (yield* find(repo, name))! }
    }))
  })

/** The request that made branch `branchId` (`conversation/new`), if one did. */
export const createRequestOf = (branchId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly createRequest: string | null }>`
      SELECT create_request AS "createRequest" FROM branches WHERE id = ${branchId}`
    return row?.createRequest ?? null
  })

/** The home conversation's id: the deployment repository's `main`, which 0014_branch_workspace records. */
export const home = Effect.gen(function* () {
  const branch = yield* find(yield* homeRepository, HOME_BRANCH)
  return branch?.conversationId
})
