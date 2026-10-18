import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Context, type Effect, Layer, Schema } from "effect"
import { isFilePath, isRepository, MAX_BLOB_BYTES, SHA_PATTERN } from "./contract"
import { TreeListing } from "./schema"

// The agent's reads of a cloned repository (decision 0006 §1, docs/features/repo.md#the-agents-reads): `repo/tree`
// lists its files at a commit, and `repo/read` reads one file there. Both are model-invocable flows of one step each,
// keyed by their inputs, since nothing at a commit SHA ever changes.
//
// They run on this device (decision 0011 §2): neither holds the Code Storage key. What a step does is injected through
// `RepoReader`: on the device, a GET of RepoApi's read routes, whose answers every cache keeps forever; on the server
// and the Node host in the tests, RepoApi's own reader over Code Storage (worker/RepoReads.ts). One implementation
// answers the routes and the flows. Nothing here names a host.

/** A repository as the agent names it: `owner/name`. */
export const RepoName = Schema.String.check(
  Schema.makeFilter((value: string) => {
    const [owner, name, ...rest] = value.split("/")
    return rest.length === 0 && owner !== undefined && name !== undefined && isRepository(owner, name)
  }),
)

/** A full commit SHA. */
export const Revision = Schema.String.check(Schema.isPattern(SHA_PATTERN))

/** A file's path in the repository. */
export const FilePath = Schema.String.check(Schema.makeFilter(isFilePath))

/** The repository, the commit or the file isn't there. */
export class RepoNotFound extends Schema.TaggedError<RepoNotFound>()("@smthrs/mvp/repo/RepoNotFound", {}) {}

/** This month's Code Storage read budget is spent, and the answer wasn't cached. */
export class RepoReadsPaused extends Schema.TaggedError<RepoReadsPaused>()("@smthrs/mvp/repo/RepoReadsPaused", {}) {}

/**
 * Code Storage or RepoApi couldn't answer: busy, thawing a cold repository, or unreachable. `retryAfterMillis` is how
 * long the server asked to wait, which the step's retry policy honors.
 */
export class RepoReadUnavailable extends Schema.TaggedError<RepoReadUnavailable>()(
  "@smthrs/mvp/repo/RepoReadUnavailable",
  { retryAfterMillis: Schema.optional(Schema.Number) },
) {}

/** What a read can fail with. */
export const ReadFailure = Schema.Union([RepoNotFound, RepoReadsPaused, RepoReadUnavailable])
export type ReadFailure = typeof ReadFailure.Type

/**
 * One file as the agent reads it: its text, or only its size when it is binary or larger than `MAX_BLOB_BYTES`.
 * Sizes are in bytes.
 */
export const FileRead = Schema.Union([
  Schema.Struct({ state: Schema.Literal("text"), contents: Schema.String, size: Schema.Number }),
  Schema.Struct({ state: Schema.Literals(["binary", "too-large"]), size: Schema.Number }),
])
export type FileRead = typeof FileRead.Type

/** Where a read step reads: the host provides it. */
export class RepoReader extends Context.Service<
  RepoReader,
  {
    readonly tree: (owner: string, name: string, sha: string) => Effect.Effect<TreeListing, ReadFailure>
    readonly read: (owner: string, name: string, sha: string, path: string) => Effect.Effect<FileRead, ReadFailure>
  }
>()("@smthrs/mvp/repo/RepoReader") {}

/** How long a read keeps trying while Code Storage is busy: 1 s doubling to 15 s, for at most 2 minutes. */
export const READ_RETRY = RetryPolicy.make({
  initialMs: 1_000,
  factor: 2,
  maxMs: 15_000,
  expirationMs: 2 * 60_000,
  nonRetryable: ["@smthrs/mvp/repo/RepoNotFound", "@smthrs/mvp/repo/RepoReadsPaused"],
})

const treePayload = { repo: RepoName, revision: Revision }
const readPayload = { repo: RepoName, revision: Revision, path: FilePath }

/** The step: list the files. */
export const ReadTree = Action.make("repo/ReadTree", {
  payload: treePayload,
  success: TreeListing,
  error: ReadFailure,
  retryPolicy: READ_RETRY,
})

/** The step: read one file. */
export const ReadFile = Action.make("repo/ReadFile", {
  payload: readPayload,
  success: FileRead,
  error: ReadFailure,
  retryPolicy: READ_RETRY,
})

/** `repo/tree { repo, revision }`: every file's path at a commit. */
export const RepoTree = Flow.make("repo/tree", {
  description: "List every file path of a cloned repository (owner/name) at a full commit SHA. Answers " +
    "{ paths, truncated }; truncated is true when the listing stopped before the end.",
  modelInvocable: true,
  payload: treePayload,
  success: TreeListing,
  error: ReadFailure,
  body: Node.capture({ action: ReadTree.name }, (payload) => ReadTree.call(payload)),
}).annotate(Flow.Placement, Placement.client())

/** `repo/read { repo, revision, path }`: one file at a commit. */
export const RepoRead = Flow.make("repo/read", {
  description: "Read one file of a cloned repository (owner/name) at a full commit SHA. Answers " +
    `{ state: "text", contents, size }, or { state, size } for a binary file or one over ${MAX_BLOB_BYTES} bytes.`,
  modelInvocable: true,
  payload: readPayload,
  success: FileRead,
  error: ReadFailure,
  body: Node.capture({ action: ReadFile.name }, (payload) => ReadFile.call(payload)),
}).annotate(Flow.Placement, Placement.client())

/** `owner/name` as its two parts; `RepoName` has checked it. */
const parts = (repo: string): readonly [string, string] => {
  const [owner, name] = repo.split("/") as [string, string]
  return [owner, name]
}

/** Registers both read flows, reading through the host's `RepoReader`. */
export const registration = Layer.merge(
  Interpreter.layerWithImplementations(
    RepoTree,
    ReadTree.toLayer(({ repo, revision }) => {
      const [owner, name] = parts(repo)
      return RepoReader.use((reader) => reader.tree(owner, name, revision))
    }),
  ),
  Interpreter.layerWithImplementations(
    RepoRead,
    ReadFile.toLayer(({ repo, revision, path }) => {
      const [owner, name] = parts(repo)
      return RepoReader.use((reader) => reader.read(owner, name, revision, path))
    }),
  ),
)
