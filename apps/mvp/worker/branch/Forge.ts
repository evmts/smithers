import { type CodeStorage, GitRemote } from "@smthrs/effect-code-storage"
import { Context, Data, Effect, Layer, Option } from "effect"
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

/**
 * The forge didn't create a branch: one of that name exists (`exists`), it has no such repository or start (`not_found`),
 * it can't create branches here (`not_configured`: GitHub read with no credential), or it didn't answer (`unavailable`).
 */
export class CreateRefused extends Data.TaggedError("CreateRefused")<{
  readonly code: "exists" | "not_found" | "not_configured" | "unavailable"
}> {}

/** A GitHub repository, by its owner and name. */
export interface Repository {
  readonly owner: string
  readonly name: string
}

/**
 * The public repository on GitHub, read with no credential (`Forge.gitHub`). It can't create a branch, which needs a
 * credential this forge never holds.
 */
const gitHubForge = {
  upstream: ({ owner, name }: Repository): Effect.Effect<GitRemote.Upstream> =>
    Effect.succeed({ url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.git` }),
  create: (): Effect.Effect<void, CreateRefused> => Effect.fail(new CreateRefused({ code: "not_configured" })),
}

/** The remote a branch's git is read from, with its credential. */
export class Forge extends Context.Service<
  Forge,
  {
    readonly upstream: (repository: Repository) => Effect.Effect<GitRemote.Upstream>
    /** Creates `branch` at the commit `from` names, on the forge. */
    readonly create: (repository: Repository, branch: string, from: string) => Effect.Effect<void, CreateRefused>
  }
>()("@smthrs/mvp/branch/Forge") {
  /**
   * The repository's Code Storage mirror: read with a `git:read` token, and a new branch made there with a `git:write`
   * one (`CodeStorage.createBranch`). The branch is Smithers' until a person pushes it to GitHub.
   */
  static readonly codeStorage = (client: CodeStorage.Client) =>
    Layer.succeed(
      Forge,
      Forge.of({
        upstream: ({ owner, name }) => client.gitRemote(repoId(owner, name)),
        create: ({ owner, name }, branch, from) =>
          client.createBranch(repoId(owner, name), { branch, from }).pipe(
            Effect.asVoid,
            Effect.mapError((error) =>
              new CreateRefused({
                code: error.code === "conflict"
                  ? "exists"
                  : ["not_found", "repository_not_found", "ref_not_found", "branch_not_found"].includes(error.code)
                  ? "not_found"
                  : "unavailable",
              })
            ),
          ),
      }),
    )

  /**
   * The public repository on GitHub, read with no credential: GitHub answers a private one as missing. It can't create
   * a branch, which needs a credential this forge never holds.
   */
  static readonly gitHub = Layer.succeed(Forge, gitHubForge)

  /**
   * Code Storage when `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` are set, else GitHub with no credential. A branch that
   * lives on GitHub reads GitHub whichever this is (`forgeOf`).
   */
  static readonly layerConfig: Layer.Layer<Forge, never, HttpClient.HttpClient> = Layer.unwrap(
    Effect.map(RepoConfig.codeStorage, (client) => (Option.isSome(client) ? Forge.codeStorage(client.value) : Forge.gitHub)),
  )
}

/** A branch's commit on its forge, through the forge's credential: `ref_not_found` when it has no such branch. */
export const branchHead = (repository: Repository, branch: string) =>
  Effect.flatMap(Forge, (forge) =>
    Effect.flatMap(forge.upstream(repository), (upstream) => GitRemote.ref(upstream, branch)))

/** Creates `branch` on the repository's forge at the commit `from` names. */
export const createBranch = (repository: Repository, branch: string, from: string) =>
  Effect.flatMap(Forge, (forge) => forge.create(repository, branch, from))

/** The repository's default branch on its forge. */
export const defaultBranch = (repository: Repository) =>
  Effect.flatMap(Forge, (forge) =>
    Effect.flatMap(forge.upstream(repository), (upstream) => GitRemote.head(upstream)))

/**
 * The forge a branch's machine checks `branch` out through: GitHub for a branch that lives there (`forge: "github"`, a
 * TODO's attempt branch, which `todo/Begin` makes on GitHub as the App), else `deployment`, the deployment's own forge.
 * With Code Storage the deployment's forge is the mirror, which never holds a branch made on GitHub after its last pull.
 */
export const forgeOf = (deployment: Forge["Service"], branch: { readonly forge?: "github" | undefined }): Forge["Service"] =>
  branch.forge === "github" ? gitHubForge : deployment
