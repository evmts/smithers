// How one eval case runs (docs/features/agent-evals.md#how-a-case-runs): the real agent on the browser's architecture in
// Node, against ChatApi's real handler and the real model. Nothing is scripted.
//
// - ChatApi: its real handler on a scratch schema of the compose Postgres (worker/test/harness.ts), serving the metered
//   model endpoint with the deployment's default model (`CHAT_MODEL`, else `DEFAULT_CHAT_MODEL`), its key read from the
//   environment. Every role (`agent`, `judge`, `renderer`) is that model unless an admin set one.
// - The device: a fresh tab and engine leader per trial (src/test/device.ts), so the theme starts unset and the tab
//   answers its navigations. The tab dispatches `chat/Answer` as the composer does.
// - The person: when the agent asks (`app/agent/ask`), the trial answers through `run/answer`, as the card's Answer does.
// - The budget: the session adds up what the endpoint's model reported each trial spent, and a trial that would start
//   once that reaches the cap fails at once. The endpoint charges a call what it spent, and a call the provider refused
//   before any output what the provider reported, so the two agree; each trial reads both (`chargedTokens`).
// - A refusing provider: a case with `provider: "refuses"` asks a second ChatApi whose model is the deployment's
//   default with a key its provider rejects, so every call is a real refusal before any output.
import { openBudget } from "../bench/cerebras-load/budget.ts"
import { guardedModel } from "../bench/cerebras-load/guard.ts"
import { candidateConfig, refusalConfig } from "./candidate"
import { openProviderResource, waitForDispatch } from "./session-lifecycle"
import { afterAll } from "vitest"
import { HostModel } from "@smthrs/model-host"
import { EgressHttpClient } from "@smthrs/platform-node"
import { ConfigProvider, Effect, Stream } from "effect"
import { SqlClient } from "effect/sql"
import type { testFile } from "../worker/test/harness.ts"
import { DEFAULT_CHAT_MODEL } from "../worker/ModelRoles.ts"
import { answerRow, openAgent } from "../src/test/agent"
import { openDevice } from "../src/test/device"
import type { CaseInput, Person } from "./cases"
import type { Asked, Draft, Trial, Usage, View } from "./checks"
import { tokenCap } from "./report"

/** How long one answer may take, asks and flow drafts included, before the trial counts it unanswered. */
export const ANSWER_WITHIN_MS = 4 * 60_000

/** How often a trial looks for a question the agent asked. */
const POLL = "250 millis"

const providers = new Set<Awaited<ReturnType<typeof openProviderResource>>>()
afterAll(async () => { for (const provider of providers) await provider.close() })

const budgets = new Set<ReturnType<typeof openBudget>>()
afterAll(() => { for (const budget of budgets) budget.close() })

type Runtime = ReturnType<typeof testFile>
type Device = Awaited<ReturnType<typeof openDevice>>

interface RunRow {
  readonly status: string
  readonly version: number
  readonly wait: { readonly execution: string; readonly kind: string; readonly prompt: string } | null
}

/**
 * The deployment's default model, as ChatApi builds it: `CHAT_MODEL` and its key from the environment. Its provider
 * calls go through `fetch`: on Node, the host's HTTP/1.1 provider fetch, since Node's own fetch wedges on an HTTP/2
 * session the provider tore down (`EgressHttpClient.providerFetch`).
 */
export const defaultModel = (fetch: typeof globalThis.fetch) =>
  Effect.gen(function* () {
    return yield* HostModel
  }).pipe(Effect.provide(HostModel.layerConfig("CHAT_MODEL", DEFAULT_CHAT_MODEL, { fetch })))

/** The default model's provider with a key it rejects: each call is refused before any output. */
const refusedModel = (fetch: typeof globalThis.fetch) =>
  defaultModel(fetch).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(refusalConfig(process.env)))),
  )

/**
 * ChatApi with the real model on `runtime`'s schema, and a way to run one trial of a case against it, until the trials
 * have spent `maxTokens`.
 */
export const openSession = async (runtime: Runtime, maxTokens: number) => {
  // The provider pool lives as long as the eval program.
  const provider = await openProviderResource(EgressHttpClient.providerFetch(process.env))
  providers.add(provider)
  const fetch = provider.value
  const rawModel = await Effect.runPromise(defaultModel(fetch))
  const candidate = candidateConfig(process.env)
  const budget = candidate ? openBudget(process.env.INFERENCE_LEDGER!, process.env.INFERENCE_PROVIDER!, candidate, 'eval', 2) : undefined
  const model = budget ? guardedModel(rawModel, budget) : rawModel
  if (budget) budgets.add(budget)
  const agent = await openAgent(runtime, () => Stream.die(new Error("the evals' model is real")), {
    model,
    partsEvery: "250 millis",
  })
  /** ChatApi whose provider refuses every call, opened for the first case that asks for it. */
  let refusing: typeof agent | undefined
  const agentFor = async (provider: CaseInput["provider"]) => {
    if (provider === "model") return agent
    refusing ??= await openAgent(runtime, () => Stream.die(new Error("the evals' model is real")), {
      model: await Effect.runPromise(refusedModel(fetch)),
      partsEvery: "250 millis",
    })
    return refusing
  }
  const query = <A>(statement: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>) =>
    runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, statement))
  /** The tokens the model reported for every trial so far, against the run's cap. */
  const cap = tokenCap(maxTokens)

  /**
   * Runs `answerId`'s answer on `device` to its end, answering each question the agent asks as `person` would.
   * Resolves with the questions it answered, or `null` when the answer took longer than {@link ANSWER_WITHIN_MS}.
   */
  const answer = async (device: Device, answerId: string, person: Person): Promise<ReadonlyArray<Asked> | null> => {
    const asked: Array<Asked> = []
    const completed = await waitForDispatch(
      device.dispatch.dispatch("chat/Answer", { answerId }, { door: "composer", executionId: answerId }),
      Effect.promise(async () => {
        const [row] = await query<RunRow>((sql) => sql`SELECT status, version, wait FROM runs WHERE id = ${answerId}`)
        if (row?.status === "needs_you" && row.wait !== null && asked.length < row.version) {
          const value = row.wait.kind === "approval" ? person.approve : person.words
          asked.push({ kind: row.wait.kind, prompt: row.wait.prompt, value })
          await Effect.runPromise(
            device.dispatch.dispatch(
              "run/answer",
              { runId: answerId, version: row.version, execution: row.wait.execution, value },
              { door: "button" },
            ),
          )
        }
      }),
      ANSWER_WITHIN_MS,
      POLL,
    )
    if (!completed) return null
    return asked
  }

  /** One trial of `kase`: a fresh conversation and device, its ask, and what came of it. */
  const trial = async (kase: CaseInput): Promise<Trial> => {
    cap.before(kase.name)
    await query((sql) =>
      sql`TRUNCATE messages, views, runs, flow_drafts, flow_revisions, flows, model_usage RESTART IDENTITY CASCADE`
    )
    const asking = await agentFor(kase.provider)
    const device = await openDevice(asking.fetch)
    try {
      const started = Date.now()
      const answerId = await asking.ask(kase.ask)
      const asked = await answer(device, answerId, kase.person)
      const ms = Date.now() - started
      const row = await answerRow(runtime, answerId)
      const inspection = await Effect.runPromise(device.engine.inspect(answerId))
      const views = await query<{ readonly template: string; readonly props: { readonly url?: unknown } }>((sql) =>
        sql`SELECT template, props FROM views ORDER BY position`
      )
      const drafts = await query<Omit<Draft, "source"> & { readonly files: ReadonlyArray<{ readonly text: string }> }>(
        (sql) => sql`SELECT name, status, checks, files FROM flow_drafts ORDER BY created_at`,
      )
      const usage = await query<Usage>((sql) =>
        sql`SELECT role, model_id AS "modelId", input_tokens AS "inputTokens", output_tokens AS "outputTokens",
            charged_tokens AS "chargedTokens"
          FROM model_usage ORDER BY created_at`
      )
      cap.add(usage.reduce((sum, call) => sum + call.inputTokens + call.outputTokens, 0))
      return {
        status: asked === null ? "unanswered" : row.status,
        failure: row.failure,
        text: row.text,
        calls: [...inspection.children]
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
          .map((child) => ({ flow: child.flowName, input: parsed(child.input.text), status: child.status })),
        painted: device.painted.filter((mode) => mode !== undefined),
        navigated: [...device.navigated],
        views: views.map((view): View => ({
          template: view.template,
          url: typeof view.props.url === "string" ? view.props.url : null,
        })),
        asked: asked ?? [],
        drafts: drafts.map(({ name, status, checks, files }) => ({
          name,
          status,
          checks,
          source: files[0]?.text ?? null,
        })),
        usage,
        pending: [
          ...inspection.steps
            .filter((step) => step.status === "running" || step.status === "waiting")
            .map((step) => `${step.action ?? step.nodeId}:${step.status}`),
          ...(inspection.run.waiting === null ? [] : [`waiting:${inspection.run.waiting.kind}`]),
        ],
        ms,
      }
    } finally {
      await device.close()
    }
  }

  return {
    modelId: model.modelId,
    trial,
    cap,
    price: candidate ? { modelId: model.modelId, input: candidate.input, output: candidate.output } : undefined,
    campaignEstimatedUsd: () => budget?.total(),
  }
}

/** A child's input as the engine shows it: JSON when it reads, else the text. */
const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
