import { CodeStorage } from "@smthrs/effect-code-storage"
import { Config, Effect, type Layer, Option } from "effect"
import type { HttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import * as RepoClone from "./flows/RepoClone.ts"
import * as Repos from "./Repos.ts"
import { RepoUpstream } from "./RepoUpstream.ts"

// The repository feature's configuration (docs/features/repo.md#configuration), read with Effect `Config` where ChatApi
// and the `FlowExecution` Durable Object start: the Code Storage organization, GitHub's optional token, the budgets and
// the clone's deadline. Reading them while Alchemy plans the Worker is what binds each one that is set to it.

/**
 * The Code Storage client for `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` (and the optional `CODE_STORAGE_API_URL`), or
 * `None` when either is unset: this deployment clones nothing. A key that doesn't import is logged, never printed, and
 * is `None` too.
 */
export const codeStorage: Effect.Effect<Option.Option<CodeStorage.Client>, never, HttpClient.HttpClient> = Effect.gen(
  function* () {
    const credentials = yield* Config.option(CodeStorage.config).pipe(Effect.orDie)
    if (Option.isNone(credentials)) return Option.none()
    return yield* Effect.service(CodeStorage.CodeStorage).pipe(
      Effect.provide(CodeStorage.CodeStorage.layer(credentials.value)),
      Effect.map(Option.some),
      Effect.catch((error) =>
        Effect.as(
          Effect.logError("repo.config").pipe(Effect.annotateLogs({ errorCode: error.code })),
          Option.none<CodeStorage.Client>(),
        )
      ),
    )
  },
)

/**
 * What `repo/Clone` needs on this host, over `database` (the app's tables), or `None` without a Code Storage
 * organization.
 */
export const cloneServices = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const client = yield* codeStorage
    if (Option.isNone(client)) return Option.none<RepoClone.Services<E, R>>()
    const upstream = yield* Effect.service(RepoUpstream).pipe(Effect.provide(RepoUpstream.layerConfig))
    return Option.some<RepoClone.Services<E, R>>({
      database,
      codeStorage: client.value,
      upstream,
      budgets: yield* Repos.budgets,
      deadline: yield* RepoClone.deadline,
    })
  })
