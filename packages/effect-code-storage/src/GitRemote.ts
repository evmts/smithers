/**
 * A git remote's HEAD, read over git's smart HTTP protocol with no
 * credentials.
 *
 * Before mirroring a public repository, a host needs its default branch and
 * that branch's commit, and to know it exists. GitHub's REST API answers
 * that, but limits callers without a token to 60 requests an hour per IP
 * address, which a Worker's shared egress exhausts. The git endpoint every
 * `git clone` uses has no such limit: `GET <remote>/info/refs?service=git-upload-pack`
 * advertises HEAD first, with `symref=HEAD:refs/heads/<branch>` among its
 * capabilities. {@link head} reads only that first line, at most 64 KiB,
 * and stops.
 *
 * Each call is one span, `GitRemote.head`, and one count on
 * `git_remote_requests` by `outcome`.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { readAtMost } from "./internal/bounded.ts"

/**
 * Why a remote's HEAD couldn't be read:
 *
 * - `not_found`: the remote answered 401, 403 or 404, which is how GitHub
 *   answers for a repository that is missing or private;
 * - `empty`: the remote has no HEAD, as a repository with no commits;
 * - `unavailable`: any other failing status, in `status`;
 * - `transport`: no answer, or the answer broke off;
 * - `invalid_response`: an answer that isn't a smart HTTP ref advertisement,
 *   or whose service or HEAD line isn't UTF-8.
 *
 * @category errors
 * @since 0.1.0
 */
export class GitRemoteError extends Schema.TaggedError<GitRemoteError>()(
  "@smthrs/effect-code-storage/GitRemoteError",
  {
    code: Schema.Literals(["not_found", "empty", "unavailable", "transport", "invalid_response"]),
    status: Schema.optional(Schema.Number)
  }
) {
  /**
   * The code and the status, never any text from the remote.
   *
   * @since 0.1.0
   */
  override get message(): string {
    return `git remote HEAD: ${this.code}${this.status === undefined ? "" : ` (${this.status})`}`
  }
}

/**
 * A remote's HEAD: the commit it names, and the branch it points at.
 * `branch` is undefined when HEAD is detached.
 *
 * @category models
 * @since 0.1.0
 */
export interface Head {
  readonly sha: string
  readonly branch: string | undefined
}

/**
 * The counter {@link head} updates once per call: `git_remote_requests`, by
 * `outcome` (`ok`, or the failure's code).
 *
 * @category observability
 * @since 0.1.0
 */
export const requests: Metric.Counter<number> = Metric.counter("git_remote_requests", {
  description: "Git remote HEAD reads, by outcome",
  incremental: true
})

const maxAdvertisementBytes = 64 * 1024
// Fatal, so a payload that isn't UTF-8 is an error instead of U+FFFD in a branch name; BOM kept, so it can't hide.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

type Parsed =
  | { readonly _tag: "Head"; readonly head: Head }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Invalid" }
  | { readonly _tag: "Incomplete" }

/**
 * Splits up to `limit` pkt-lines off the front of `bytes`: each payload's bytes, or `null` for a flush packet. A
 * length counts bytes, so framing happens on bytes, before any decoding. Stops at the first incomplete packet.
 */
const packets = (
  bytes: Uint8Array,
  limit: number
): { readonly lines: ReadonlyArray<Uint8Array | null>; readonly invalid: boolean } => {
  const lines: Array<Uint8Array | null> = []
  let offset = 0
  while (lines.length < limit && offset + 4 <= bytes.length) {
    const header = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    if (!/^[0-9a-f]{4}$/.test(header)) return { lines, invalid: true }
    const length = Number.parseInt(header, 16)
    if (length === 0) {
      lines.push(null)
      offset += 4
      continue
    }
    if (length < 4) return { lines, invalid: true }
    if (offset + length > bytes.length) break
    lines.push(bytes.subarray(offset + 4, offset + length))
    offset += length
  }
  return { lines, invalid: false }
}

/** A complete payload as text, or `undefined` when it isn't UTF-8. */
const text = (payload: Uint8Array): string | undefined => {
  try {
    return utf8.decode(payload)
  } catch {
    return undefined
  }
}

/** Reads HEAD from the start of a v0 smart HTTP advertisement: the service line, a flush, then the first ref. */
const parseAdvertisement = (bytes: Uint8Array): Parsed => {
  const { lines, invalid } = packets(bytes, 3)
  if (invalid) return { _tag: "Invalid" }
  const [service, flush, first] = lines
  if (service === undefined) return { _tag: "Incomplete" }
  if (service === null || text(service)?.startsWith("# service=git-upload-pack") !== true) return { _tag: "Invalid" }
  if (flush === undefined) return { _tag: "Incomplete" }
  if (flush !== null) return { _tag: "Invalid" }
  if (first === undefined) return { _tag: "Incomplete" }
  if (first === null) return { _tag: "Empty" }
  const line = text(first)
  if (line === undefined) return { _tag: "Invalid" }
  const match = /^([0-9a-f]{40}|[0-9a-f]{64}) ([^\0\n]+)(?:\0([^\n]*))?\n?$/.exec(line)
  if (match === null) return { _tag: "Invalid" }
  const [, sha, ref, capabilities = ""] = match
  if (ref !== "HEAD" || /^0+$/.test(sha!)) return { _tag: "Empty" }
  // Capabilities are separated by ASCII spaces only; a branch may hold any other character git allows, U+3000 included.
  const branch = /(?:^| )symref=HEAD:refs\/heads\/([^ ]+)/.exec(capabilities)?.[1]
  return { _tag: "Head", head: { sha: sha!, branch } }
}

/**
 * Reads the HEAD of the git remote at `remote`, such as
 * `https://github.com/octocat/Spoon-Knife.git`, with no credentials.
 *
 * @category reads
 * @since 0.1.0
 */
export const head = (remote: string): Effect.Effect<Head, GitRemoteError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    const request = HttpClientRequest.get(`${remote.replace(/\/+$/, "")}/info/refs`).pipe(
      HttpClientRequest.setUrlParam("service", "git-upload-pack")
    )
    const response = yield* client.execute(request).pipe(
      Effect.mapError(() => new GitRemoteError({ code: "transport" }))
    )
    const status = response.status
    if (status === 401 || status === 403 || status === 404) {
      return yield* new GitRemoteError({ code: "not_found", status })
    }
    if (status >= 300) return yield* new GitRemoteError({ code: "unavailable", status })
    if (!(response.headers["content-type"] ?? "").startsWith("application/x-git-upload-pack-advertisement")) {
      return yield* new GitRemoteError({ code: "invalid_response", status })
    }
    const { bytes } = yield* readAtMost(
      response.stream,
      maxAdvertisementBytes,
      (read) => parseAdvertisement(read)._tag !== "Incomplete"
    ).pipe(Effect.mapError(() => new GitRemoteError({ code: "transport", status })))
    const parsed = parseAdvertisement(bytes)
    switch (parsed._tag) {
      case "Head":
        return parsed.head
      case "Empty":
        return yield* new GitRemoteError({ code: "empty", status })
      default:
        return yield* new GitRemoteError({ code: "invalid_response", status })
    }
  }).pipe(
    Effect.onExit((exit) =>
      Metric.update(
        Metric.withAttributes(requests, {
          outcome: Exit.isSuccess(exit) ?
            "ok" :
            Option.match(Exit.findErrorOption(exit), { onNone: () => "interrupted", onSome: (error) => error.code })
        }),
        1
      )
    ),
    Effect.withSpan("GitRemote.head", { attributes: { "git.remote": remote } })
  )
