/*
 * The `repos` flows. One module per namespace: a lane that adds or edits a
 * flow here touches no other flow module, and Flows.ts registers each block in
 * the aggregator order.
 */
import { Schema } from "effect"
import { flow, RepoTarget } from "./Declare"
import type { FlowEntry, Namespace } from "../registry"
import type { CommandActions } from "./Declare"

/** The `repos` namespace row: the slash tree lists it in registry.ts NAMESPACES order. */
export const namespace: Namespace = { id: "repos", label: "Repositories", summary: "GitHub and Smithers Cloud repositories" }

/** `repos.import`, registered after billing. */
export const reposImportFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  /*
   * The multi-parity domain flows (MULTI-ACTIONS-GAP.md): issues, PRs
   * (landings — a land QUEUES, it never "merges"), billing checkout,
   * notifications, the agent environment, and repo import. Repo-scoped flows
   * take an optional `repo` target; absent one, a single watched repository is
   * the target and several are an honest choice (RepoContext.ts). They require
   * signed-in only — an explicit owner/repo must not defer into the
   * watched-repos chooser.
   */
  flow({
    name: "repos.import", hidden: true, discloseToAgent: false,
    summary: "Import a GitHub repository into Smithers Cloud",
    runtime: ["cloud"],
    args: "[owner/repo]",
    requires: ["signed-in"],
    input: RepoTarget,
    handler: ({ repo }) => actions.importRepository(repo)
  })
]

/**
 * `repos.explore`: read the public repository catalog again (M-45). A
 * catalog that could not be read offers this and shows no shelf; it never
 * presents an empty one as "nothing is public".
 */
export const reposExploreFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({
    name: "repos.explore", hidden: true, discloseToAgent: false,
    summary: "Read the public repository catalog again",
    input: Schema.Struct({}), grammar: () => ({ payload: {} }),
    handler: async () => { await actions.launcher?.retryCatalog() }
  })
]

/** A GitHub repository name: the one the account's new repository is created under. */
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]{1,100}$/

/**
 * `repos.create`, registered beside `repos.import`: the launcher's create
 * door (M-45). It runs the backend's REAL GitHub create — one
 * `POST https://api.github.com/user/repos` made server-side with this
 * person's own GitHub credential, admitted as a durable operation and
 * reported only from the repository the server read back
 * (state/seams/GitHubRepoCreateSeam.ts).
 *
 * So nothing here reports a repository that was not made: a refused create
 * answers the backend's own refusal, an unconfirmed one says it is
 * unconfirmed and is never repeated, and a created repository is NOT
 * presented as imported into Smithers — opening `/owner/name` is that step.
 *
 * The Smithers Cloud create (`RepositoriesSeam.createRepository`,
 * `POST /user/repos`) is unchanged and still creates a Smithers Cloud
 * repository; it is the native act, and this door is not it.
 */
export const reposCreateFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({
    name: "repos.create", hidden: true, discloseToAgent: false,
    summary: "Create a repository on your GitHub account",
    runtime: ["cloud"],
    agent: "never",
    agentReason: "creating a repository on the person's GitHub account is the person's act",
    actors: ["person"],
    args: "<name>",
    requires: ["signed-in"],
    input: Schema.Struct({ name: Schema.String }),
    grammar: (args) => {
      const name = args?.trim() ?? ""
      return REPOSITORY_NAME.test(name) ? { payload: { name } } : { error: "Enter a repository name" }
    },
    form: { fields: { name: { label: "Repository name", kind: "text" } }, args: (payload) => String(payload.name ?? "") },
    handler: async ({ name }) => {
      if (!REPOSITORY_NAME.test(name.trim())) return "Enter a repository name"
      return actions.createGitHubRepository(name.trim())
    }
  })
]

/** `repos.import.retry`, registered beside the GitHub mirror flows it retries. */
export const reposImportRetryFlows = (actions: CommandActions): ReadonlyArray<FlowEntry> => [
  flow({
    name: "repos.import.retry", hidden: true, discloseToAgent: false,
    summary: "Retry a failed GitHub import job",
    runtime: ["cloud"],
    args: "<jobId>",
    requires: ["signed-in"],
    input: Schema.Struct({ jobId: Schema.String }),
    handler: ({ jobId }) => actions.retryImport(jobId)
  })
]
