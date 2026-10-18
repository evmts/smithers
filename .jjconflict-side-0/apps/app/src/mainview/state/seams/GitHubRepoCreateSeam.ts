import { isRecord } from "@smthrs/canonical/Record"
import { createCloudClient } from "./CloudClient"
import { captureCloudOwner, readResult } from "./SeamContext"
import type { SeamContext } from "./SeamContext"

/*
 * Creating a repository on the person's OWN GitHub account (M-45's Create).
 *
 * This is NOT the Smithers Cloud create (`RepositoriesSeam.createRepository`,
 * `POST /user/repos`), which writes a Smithers repository row and calls GitHub
 * never. It is the backend's durable GitHub create
 * (`POST /user/github-repos` -> services/github_user_repo_create.go): one
 * `POST https://api.github.com/user/repos` made with that person's own GitHub
 * credential, server-side.
 *
 * The door answers 202 with an operation, so this seam reads the operation
 * until it settles instead of treating the acknowledgment as the repository:
 *
 *  - the owner, the credential and the idempotency key are the SERVER's. This
 *    client sends a name and nothing else, so it cannot write under another
 *    login, forge a URL, or fork one intent into two repositories.
 *  - `completed` is the only answer that reports a repository, and the
 *    repository it reports is the one the server read back from GitHub.
 *  - `uncertain` is never retried here. A repeat press reaches the same
 *    server-side key and joins that one operation, so an unconfirmed POST can
 *    never become a second repository.
 *  - a repository created on GitHub is NOT imported into Smithers and the
 *    GitHub App is NOT installed on it; the sentence says so and the person's
 *    own next act does that.
 */

/** The create door, under the cloud client's `/api` prefix. */
export const GITHUB_REPO_CREATE_PATH = "/user/github-repos"
/** The receipt door: a lost acknowledgment is READ here, never posted again. */
export const GITHUB_REPO_REQUEST_PATH = "/user/github-repo-requests"

/** The states the store can still move on; anything else is terminal. */
const PENDING = new Set(["accepted", "dispatching", "running", "waiting"])

export interface GitHubRepoCreateSeam {
  /** Create `name` on the person's GitHub account, and report what happened. */
  readonly createGitHubRepository: (name: string) => Promise<string | { readonly value: string }>
}

const stringOf = (value: unknown): string | null => typeof value === "string" && value !== "" ? value : null

/**
 * The sentence for one settled operation. Each code names a different act and
 * none of them reports a repository the server did not read back.
 */
export const githubRepoCreateAnswer = (
  name: string,
  state: string,
  code: string | null,
  fullName: string | null
): string | { readonly value: string } => {
  if (state === "completed") {
    return fullName === null
      ? "GitHub reported the repository was created, but Smithers couldn't read which one. Check your GitHub account."
      : readResult(`Created ${fullName} on GitHub. Smithers hasn't imported it yet — open /${fullName} to import it.`)
  }
  if (state === "uncertain") {
    return `Smithers couldn't confirm whether ${name} was created on GitHub, so it did not try again. Check your GitHub account before creating it a second time.`
  }
  switch (code) {
    case "repository_exists":
      return `Your GitHub account already has a repository named ${name}. Nothing was created.`
    case "reauthorize_github":
      return `GitHub didn't accept the credential linked to this account. Sign in with GitHub again, then create ${name}.`
    case "github_permission":
      return `GitHub refused to create a repository for your account.`
    case "rate_limited":
      return `GitHub is rate-limiting this account, so ${name} was not created. Try again in a few minutes.`
    case "actor_changed":
      return `The signed-in GitHub account changed, so ${name} was not created.`
    case "readback_mismatch":
      return `GitHub answered with a different repository, so Smithers won't report ${name} as created.`
    default:
      return `GitHub didn't create ${name}.`
  }
}

/**
 * `pollMs` and `attempts` bound the receipt read: a create still running when
 * they run out is reported as still running, which is true, rather than as a
 * failure or a success.
 */
export const createGitHubRepoCreateSeam = (
  ctx: SeamContext,
  { pollMs = 1000, attempts = 60 }: { readonly pollMs?: number; readonly attempts?: number } = {}
): GitHubRepoCreateSeam => {
  const cloud = createCloudClient(ctx)
  return {
    createGitHubRepository: async (name) => {
      const currentOwner = captureCloudOwner(ctx, false)
      const admitted = await cloud.send("POST", GITHUB_REPO_CREATE_PATH, { name }, "repository creation")
      if (!currentOwner()) return "The account changed; create the repository again."
      if ("error" in admitted) return admitted.error
      const operationId = isRecord(admitted.body) ? stringOf(admitted.body.operationId) : null
      if (operationId === null) return "Smithers couldn't read the repository request it just made."
      for (let attempt = 0; attempt < attempts; attempt++) {
        const answer = await cloud.get(`${GITHUB_REPO_REQUEST_PATH}/${encodeURIComponent(operationId)}`, "repository creation")
        if (!currentOwner()) return "The account changed; the repository request is still on the server."
        if ("error" in answer) return answer.error
        if (!isRecord(answer.body)) return "Smithers couldn't read what became of the repository request."
        const state = stringOf(answer.body.state)
        if (state === null) return "Smithers couldn't read what became of the repository request."
        if (!PENDING.has(state)) {
          return githubRepoCreateAnswer(name, state, stringOf(answer.body.code), stringOf(answer.body.full_name))
        }
        await new Promise<void>(resolve => setTimeout(resolve, pollMs))
        if (!currentOwner()) return "The account changed; the repository request is still on the server."
      }
      /*
       * Still running. The receipt stays on the server, so pressing Create
       * again reads this same operation instead of opening a second POST.
       */
      return `Creating ${name} on GitHub is still running. Nothing was repeated; read it again in a moment.`
    }
  }
}
