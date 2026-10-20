import { ImmutableCache } from "@smthrs/artifacts"
import { CodeStorage } from "@smthrs/effect-code-storage"
import { Cause, Config, Data, Effect, Layer, Metric, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { MAX_BLOB_BYTES, repoId, textOf, TREE_PAGE_SIZE } from "../src/features/repo/contract.ts"
import {
  type FileRead,
  RepoNotFound,
  RepoReader,
  RepoReadsPaused,
  RepoReadUnavailable,
} from "../src/features/repo/flows.ts"
import { TreeListing } from "../src/features/repo/schema.ts"
import { codeOf } from "./ErrorCode.ts"
import * as RepoMetrics from "./RepoMetrics.ts"
import * as Repos from "./Repos.ts"

// Reading a cloned repository at a commit (decision 0006 §1, docs/features/repo.md#reads): one implementation for
// RepoApi's `GET` routes and the agent's `repo/tree` and `repo/read` flows. Nothing at a commit SHA changes, so every
// answer goes through the immutable cache first: a hit costs Code Storage nothing and is served over budget too. A
// miss checks this month's read budget, reads Code Storage, and meters what it read. A failed read is never cached.

/** Why a read couldn't answer: RepoApi's status and code, a file's size, and Code Storage's wait. */
export class ReadRefused extends Data.TaggedError("ReadRefused")<{
  readonly code: "not_found" | "too_large" | "capacity" | "unavailable"
  readonly size?: number
  readonly retryAfterMillis?: number
}> {}

/** What reads need: Code Storage, Postgres for the read budget and its meter, the budgets, and the tree bound. */
export interface Services<E = unknown, R = never> {
  readonly codeStorage: CodeStorage.Client
  readonly database: Layer.Layer<SqlClient.SqlClient, E, R>
  readonly budgets: Repos.Budgets
  /** The most paths a tree lists before it answers `truncated` (`REPO_TREE_MAX_PATHS`, default 50,000). */
  readonly maxTreePaths: number
}

/** Reads `REPO_TREE_MAX_PATHS`. */
export const maxTreePaths = Config.schema(Schema.Int.check(Schema.isGreaterThan(0)), "REPO_TREE_MAX_PATHS").pipe(
  Config.withDefault(50_000),
)

/** Code Storage's codes for a repository, ref or path it doesn't have. */
const MISSING = new Set(["not_found", "repository_not_found", "ref_not_found", "branch_not_found", "repository_deleted"])

const refusedBy = (error: CodeStorage.CodeStorageError): ReadRefused =>
  error.code === "too_large"
    ? new ReadRefused({ code: "too_large", ...(error.size === undefined ? {} : { size: error.size }) })
    : MISSING.has(error.code)
    ? new ReadRefused({ code: "not_found" })
    : new ReadRefused({
      code: "unavailable",
      ...(error.retryAfterMillis === undefined ? {} : { retryAfterMillis: error.retryAfterMillis }),
    })

const encoder = new TextEncoder()
const decodeListing = Schema.decodeUnknownEffect(Schema.fromJsonString(TreeListing))

/** The reads over `services`. Each needs the `ImmutableCache` in context. */
export const make = <E, R>(services: Services<E, R>) => {
  const { codeStorage, database, budgets } = services

  /** Refuses a miss once this month's reads are spent; a budget Postgres can't read is `unavailable`. */
  const admitRead = Repos.readsSpent(budgets).pipe(
    Effect.provide(database),
    Effect.mapError(() => new ReadRefused({ code: "unavailable" })),
    Effect.flatMap((spent) => (spent ? Effect.fail(new ReadRefused({ code: "capacity" })) : Effect.void)),
  )

  /** Adds what Code Storage served to this month's reads. A meter Postgres refuses is logged, and the read answers. */
  const meter = (bytes: number) =>
    Repos.meterRead(bytes, budgets).pipe(
      Effect.provide(database),
      Effect.flatMap(RepoMetrics.recordSpend),
      Effect.catchCause((cause) =>
        Effect.logWarning("repo.meter").pipe(Effect.annotateLogs({ bytes, errorCode: codeOf(Cause.squash(cause)) }))
      ),
    )

  /** Every page of `id`'s files at `sha`, until `maxTreePaths`. */
  const listAll = (id: string, sha: string) =>
    Effect.gen(function* () {
      const paths: Array<string> = []
      let cursor: string | undefined
      let bytesRead = 0
      do {
        const page = yield* codeStorage.listFiles(id, {
          ref: sha,
          recursive: true,
          limit: TREE_PAGE_SIZE,
          ...(cursor === undefined ? {} : { cursor }),
        })
        bytesRead += page.bytesRead
        paths.push(...page.paths)
        cursor = page.nextCursor
      } while (cursor !== undefined && paths.length < services.maxTreePaths)
      const truncated = cursor !== undefined || paths.length > services.maxTreePaths
      return { listing: { paths: paths.slice(0, services.maxTreePaths), truncated }, bytesRead }
    })

  /** `owner/name`'s files at `sha`, as `TreeListing` JSON. */
  const tree = (owner: string, name: string, sha: string) => {
    const id = repoId(owner, name)
    return ImmutableCache.readThrough(
      ImmutableCache.key("repo.tree", id, sha),
      Effect.gen(function* () {
        yield* admitRead
        const { listing, bytesRead } = yield* listAll(id, sha).pipe(Effect.mapError(refusedBy))
        yield* meter(bytesRead)
        return { bytes: encoder.encode(JSON.stringify(listing)), metadata: {} }
      }),
    ).pipe(Effect.map((entry) => entry.bytes))
  }

  /** One file of `owner/name` at `sha`: its bytes, and its git blob id when Code Storage sent one. */
  const blob = (owner: string, name: string, sha: string, path: string) => {
    const id = repoId(owner, name)
    return ImmutableCache.readThrough(
      ImmutableCache.key("repo.blob", id, sha, path),
      Effect.gen(function* () {
        yield* admitRead
        const file = yield* codeStorage.readFile(id, { path, ref: sha, maxBytes: MAX_BLOB_BYTES }).pipe(
          Effect.mapError(refusedBy),
        )
        yield* meter(file.bytes.length)
        const metadata: Record<string, string> = file.blobSha === undefined ? {} : { blobSha: file.blobSha }
        return { bytes: file.bytes, metadata }
      }),
    )
  }

  return { tree, blob }
}

/** A read's refusal as the flows declare it. */
const flowFailure = (refused: ReadRefused) =>
  refused.code === "not_found"
    ? new RepoNotFound()
    : refused.code === "capacity"
    ? new RepoReadsPaused()
    : new RepoReadUnavailable(refused.retryAfterMillis === undefined ? {} : { retryAfterMillis: refused.retryAfterMillis })

/**
 * The agent's reads on the server and the Node host: `RepoReader` over the same reads RepoApi answers, within `cache`.
 * A file over `MAX_BLOB_BYTES` is `too-large`, and a binary one only its size.
 */
export const reader = (reads: ReturnType<typeof make<unknown, never>>, cache: Layer.Layer<ImmutableCache.ImmutableCache>) =>
  Layer.succeed(
    RepoReader,
    RepoReader.of({
      tree: (owner, name, sha) =>
        reads.tree(owner, name, sha).pipe(
          Effect.flatMap((bytes) => Effect.orDie(decodeListing(new TextDecoder().decode(bytes)))),
          Effect.mapError(flowFailure),
          Effect.provide(cache),
        ),
      read: (owner, name, sha, path) =>
        reads.blob(owner, name, sha, path).pipe(
          Effect.map(({ bytes }): FileRead => {
            const text = textOf(bytes)
            return text === undefined
              ? { state: "binary", size: bytes.length }
              : { state: "text", contents: text, size: bytes.length }
          }),
          Effect.catchIf(
            (refused) => refused.code === "too_large",
            (refused): Effect.Effect<FileRead> => Effect.succeed({ state: "too-large", size: refused.size ?? MAX_BLOB_BYTES + 1 }),
          ),
          Effect.mapError(flowFailure),
          Effect.provide(cache),
        ),
    }),
  )

/** Counts a read RepoApi answered, by kind and status, and the bytes it returned. */
export const counted = (kind: "tree" | "blob", status: number, bytes: number) =>
  Effect.andThen(
    Metric.update(Metric.withAttributes(RepoMetrics.reads, { kind, status: String(status) }), 1),
    Metric.update(RepoMetrics.readBytes, bytes),
  )
