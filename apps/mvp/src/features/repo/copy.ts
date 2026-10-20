import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { Clock, Context, type Duration, Effect, Layer, Metric, Option } from "effect"
import { asker } from "../../flows/askingTab"
import type { Door } from "../../flows/dispatch"
import { requesterOf } from "../../flows/requests"
import { clipboardChannel, cloneUrl, COPY_WITHIN, type CopyOutcome } from "./contract"
import { Copied, type CopyFailure, CopyText, parts, RepoCopy, RepoCopyRefused, RepoReader } from "./flows"
import { copies } from "./metrics"
import { hrefFor } from "./paths"

// `repo/copy`'s step (docs/features/repo.md#copy): works out the text a Copy button copies and puts it on the clipboard
// of the tab that asked. Its one step runs in the leader tab's engine worker, which has no clipboard, so it asks over
// the engine's clipboard channel for the tab that started the request (src/flows/askingTab.ts), as `app/navigate` asks
// for the tab to move: the tab whose button dispatched it, or, for the agent's call, the tab whose composer asked.
// Only that tab writes; a tab that is gone settles the step with `copied: false`. Nothing records the text.

/** What the tab answers: the door the request came through, and whether it copied. */
export interface Reply {
  readonly door: Door
  readonly copied: boolean
}

/** The clipboards of this browser's tabs, as the step reaches them: only the tab that started a request answers. */
export class TabClipboard extends Context.Service<
  TabClipboard,
  {
    /** The app's origin: a permalink is a full URL on it. */
    readonly origin: string
    /**
     * Asks the tab that started `requester` to put `text` on its clipboard, or, without `text`, only for its door.
     * Answers with its reply, or none when no tab answered within the wait: the tab that asked is gone.
     */
    readonly write: (call: { readonly requester: string; readonly text?: string }) => Effect.Effect<Option.Option<Reply>>
  }
>()("@smthrs/mvp/repo/TabClipboard") {
  /**
   * Over the clipboard channel of engine `name` (`TabChannel`), for the app on `origin`, waiting `within`
   * (`COPY_WITHIN` unless set) for the tab's reply.
   */
  static readonly layerChannel = (options: {
    readonly name: string
    readonly origin: string
    readonly within?: Duration.Input
  }) =>
    Layer.effect(
      TabClipboard,
      Effect.gen(function* () {
        const ask = yield* asker<{ readonly text?: string }, typeof Copied>({
          channel: clipboardChannel(options.name),
          output: Copied,
          within: options.within ?? COPY_WITHIN,
        })
        return TabClipboard.of({
          origin: options.origin,
          write: ({ requester, text }) =>
            ask(requester, text === undefined ? {} : { text }).pipe(
              Effect.map(Option.map(({ door, output }) => ({ door, copied: output.copied }))),
            ),
        })
      }),
    )
}

/** `repo/copy`'s payload. */
export type CopyPayload = typeof RepoCopy.payloadSchema.Type

/** The text to copy for `payload`: built from it, or for `contents` read at its commit through the host's reader. */
export const textOf = (payload: CopyPayload, origin: string) =>
  Effect.gen(function* () {
    const [owner, name] = parts(payload.repo)
    const invalid = new RepoCopyRefused({ reason: "invalid" })
    switch (payload.what) {
      case "clone-url":
        return cloneUrl(owner, name)
      case "path":
        return payload.path ?? (yield* invalid)
      case "permalink": {
        if (payload.revision === undefined) return yield* invalid
        const path = payload.path ?? ""
        const href = hrefFor({ owner, name, defaultBranch: null }, payload.revision, {
          kind: payload.kind ?? (path === "" ? "tree" : "blob"),
          path,
          line: payload.line,
          lineEnd: payload.lineEnd,
        })
        return `${origin}${href}`
      }
      case "contents": {
        if (payload.revision === undefined || payload.path === undefined) return yield* invalid
        const file = yield* (yield* RepoReader).read(owner, name, payload.revision, payload.path)
        return file.state === "text" ? file.contents : yield* new RepoCopyRefused({ reason: "not_text" })
      }
    }
  })

/** How a failure to work out the text counts. */
const failedAs = (error: CopyFailure): CopyOutcome =>
  error._tag === "@smthrs/mvp/repo/RepoCopyRefused" || error._tag === "@smthrs/mvp/repo/RepoNotFound"
    ? "refused"
    : "unavailable"

/**
 * What `repo/copy/write` does: the text for `payload`, asked of the tab that started the run (`requesterOf` its
 * execution), which writes its clipboard. Records the copy as a span `repo.copy`, a log line and a count of `copies`
 * by what, door and outcome, never the text or the path. Nothing to copy fails `RepoCopyRefused`, an unreadable file
 * its read failure; a tab that is gone, or whose clipboard refused, answers `copied: false`.
 */
export const copy = (payload: CopyPayload) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const { executionId } = yield* FlowRuntime.FlowInstance
    const clipboard = yield* TabClipboard
    const requester = requesterOf(executionId)
    const text = yield* Effect.result(textOf(payload, clipboard.origin))
    // With nothing to copy, the tab still says which door asked.
    const reply = yield* clipboard.write(text._tag === "Success" ? { requester, text: text.success } : { requester })
    // The agent's call belongs to the answer its tab asked for; a tab's own dispatch names its door in its reply.
    const door: Door | "unknown" = executionId !== requester
      ? "agent"
      : Option.match(reply, { onNone: () => "unknown" as const, onSome: (answered) => answered.door })
    const outcome: CopyOutcome = text._tag === "Failure"
      ? failedAs(text.failure)
      : Option.isNone(reply)
      ? "gone"
      : reply.value.copied
      ? "copied"
      : "failed"
    yield* Metric.update(Metric.withAttributes(copies, { what: payload.what, door, outcome }), 1)
    yield* Effect.annotateCurrentSpan({ "smithers.repo.copy": payload.what, outcome, door })
    const durationMs = (yield* Clock.currentTimeMillis) - startedAt
    yield* Effect.logWithLevel(outcome === "copied" ? "Info" : outcome === "refused" ? "Warn" : "Error")("repo.copy")
      .pipe(Effect.annotateLogs({ what: payload.what, door, outcome, executionId, durationMs, feature: "repo" }))
    if (text._tag === "Failure") return yield* Effect.fail(text.failure)
    return { copied: outcome === "copied" }
  }).pipe(Effect.withSpan("repo.copy"))

/** Registers `repo/copy` with its step, reading through the host's `RepoReader` and writing through `TabClipboard`. */
export const registration = Interpreter.layerWithImplementations(RepoCopy, CopyText.toLayer(copy))
