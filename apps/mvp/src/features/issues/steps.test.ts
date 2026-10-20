import { WebCrypto } from "@smthrs/crypto"
import { FlowRuntime } from "@smthrs/flow"
import { TabChannel } from "@smthrs/platform-browser"
import { Cause, Effect, Exit, Metric, Option } from "effect"
import { describe, expect, test } from "vitest"
import { IssueWriteRefused } from "./flows"
import { writes } from "./metrics"
import { queueWrite, TabIssues } from "./steps"

// An issue write's step when no tab answers on the engine's issues channel (Node's own `BroadcastChannel`): the tab that
// asked is gone. The step runs here as its engine runs it, in the run its execution id names; the retry policy, which
// asks again for 30 s, is the engine's. Every step a tab answers runs on a real engine in issues.test.ts.

/** The step for `executionId`, asking a channel no tab listens on, counting into `registry`. */
const run = (executionId: string, registry: Metric.MetricRegistry) =>
  Effect.runPromise(
    Effect.exit(
      queueWrite({ op: "issue/comment", repo: "octo/hello", number: 7, body: "Hi" }).pipe(
        // Only the execution id is read.
        Effect.provideService(FlowRuntime.FlowInstance, { executionId } as FlowRuntime.FlowInstance["Service"]),
        Effect.provide(TabIssues.layerChannel({ name: `none-${crypto.randomUUID()}`, within: "100 millis" })),
        Effect.provide(TabChannel.layer),
        Effect.provide(WebCrypto.layer),
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    ),
  )

/** How the step failed: its declared error, if any. */
const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined

const count = (registry: Metric.MetricRegistry, attributes: Record<string, string>) =>
  Effect.runSync(
    Metric.value(Metric.withAttributes(writes, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  ).count

describe("no tab answers", () => {
  test("a person's press: the tab is gone, by an unknown door", async () => {
    const registry: Metric.MetricRegistry = new Map()
    expect(failure(await run(crypto.randomUUID(), registry))).toEqual(new IssueWriteRefused({ reason: "tab_gone" }))
    expect(count(registry, { op: "issue/comment", door: "unknown", outcome: "tab_gone" })).toBe(1)
  })

  test("the agent's call: the tab is gone, by the agent's door", async () => {
    const registry: Metric.MetricRegistry = new Map()
    expect(failure(await run("answer-1/chat/Respond@abc:1/call/1.0", registry))).toEqual(
      new IssueWriteRefused({ reason: "tab_gone" }),
    )
    expect(count(registry, { op: "issue/comment", door: "agent", outcome: "tab_gone" })).toBe(1)
  })
})
