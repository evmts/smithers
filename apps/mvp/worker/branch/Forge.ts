import { type CodeStorage, GitRemote } from "@smthrs/effect-code-storage"
import { Context, Effect, Layer, Option } from "effect"
import type { HttpClient } from "effect/http"
import { repoId } from "../../src/features/repo/contract.ts"
import * as RepoConfig from "../RepoConfig.ts"

// Where a branch's git comes from (decision 0013 §2, docs/features/branch-workspace.md#the-forge): the remote and the
// read credential the host adds outside the sandbox. `branch/Track` reads a branch through it, and the branch sandbox's
// forge proxy clones through it (`GitProxy.uploadPack`). Two forges:
//
// - Code Storage, when this deployment has an organization: the repository's mirror, with a five-minute `git:read`
//   token for that one repository (`CodeStorage.gitRemote`). The repository must have been cloned, and a clone admits
//   only a public repository (docs/features/repo.md).
// - GitHub otherwise: the public repository itself, with no credential at all. `GITHUB_TOKEN` is never used here: it
//   would read every repository its owner can, private ones included, for anyone who names one. Private repositories
//   wait for per-repository GitHub App installation tokens (decision 0008 §5).

/** A GitHub repository, by its owner and name. */
export interface Repository {
  readonly owner: string
  readonly name: string
}

/** The remote a branch's git is read from, with its credential. */
export class Forge extends Context.Service<
  Forge,
  { readonly upstream: (repository: Repository) => Effect.Effect<GitRemote.Upstream> }
>()("@smthrs/mvp/branch/Forge") {
  /** The repository's Code Storage mirror, read with a `git:read` token. */
  static readonly codeStorage = (client: CodeStorage.Client) =>
    Layer.succeed(Forge, Forge.of({ upstream: ({ owner, name }) => client.gitRemote(repoId(owner, name)) }))

  /** The public repository on GitHub, read with no credential: GitHub answers a private one as missing. */
  static readonly gitHub = Layer.succeed(
    Forge,
    Forge.of({
      upstream: ({ owner, name }) =>
        Effect.succeed({ url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.git` }),
    }),
  )

  /** Code Storage when `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` are set, else GitHub with no credential. */
  static readonly layerConfig: Layer.Layer<Forge, never, HttpClient.HttpClient> = Layer.unwrap(
    Effect.map(RepoConfig.codeStorage, (client) => (Option.isSome(client) ? Forge.codeStorage(client.value) : Forge.gitHub)),
  )
}

/** A branch's commit on its forge, through the forge's credential: `ref_not_found` when it has no such branch. */
export const branchHead = (repository: Repository, branch: string) =>
  Effect.flatMap(Forge, (forge) =>
    Effect.flatMap(forge.upstream(repository), (upstream) => GitRemote.ref(upstream, branch)))

/** The repository's default branch on its forge. */
export const defaultBranch = (repository: Repository) =>
  Effect.flatMap(Forge, (forge) =>
    Effect.flatMap(forge.upstream(repository), (upstream) => GitRemote.head(upstream)))
