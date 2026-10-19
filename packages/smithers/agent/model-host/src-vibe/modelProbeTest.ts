// D38/EK1005 (A-2, E-4): `ModelProbe.test` awaits the credential store and runs the
// Test's program with Effect.runPromiseExit, a runner boundary that answers a Promise,
// so it stays TypeScript. Planning, the transport and the program are ModelProbe.vibe's.
import {
  failedModelTest,
  modelCallDefault,
  modelCallSample
} from "@smthrs/rpc/ConfiguredModel"
import type {
  ConfiguredModel,
  ModelCallInput,
  ModelCallOutput,
  ModelTestFailure,
  ModelTestResult
} from "@smthrs/rpc/ConfiguredModel"
import { Effect, Exit, Redacted } from "effect"
import type { Layer } from "effect"
import type { HttpClient } from "effect/http/HttpClient"
import type { LocalPlanned, ManualRedirects, ModelCredentials } from "./LocalModel.vibe"

type Outcome = { readonly output: ModelCallOutput } | { readonly failure: ModelTestFailure }

/** What one Test plans with, dials through, and runs. */
export interface ProbeSteps {
  readonly plan: (model: ConfiguredModel) => LocalPlanned
  readonly transport: () => ManualRedirects
  readonly outcome: (
    planned: Extract<LocalPlanned, { ok: true }>,
    request: ModelCallInput,
    bounded: boolean,
    transport: Layer.Layer<HttpClient>
  ) => Effect.Effect<Outcome>
}

export const probeTest = (
  options: { readonly credentials?: ModelCredentials },
  steps: ProbeSteps
) =>
async (model: ConfiguredModel, input?: ModelCallInput): Promise<ModelTestResult> => {
  const started = performance.now()
  const failed = (failure: ModelTestFailure): ModelTestResult =>
    failedModelTest(failure, performance.now() - started, "local")
  // A credential store that cannot be read is a dependency failure; its
  // error may quote a secret, so it is dropped like a defect.
  let planned: LocalPlanned
  try {
    await options.credentials?.refresh()
    planned = steps.plan(model)
  } catch {
    return failed({ code: "unreachable" })
  }
  if (!planned.ok) return failed(planned.failure)
  const request = input ?? modelCallDefault(planned.plan.kind)
  // A prompt for a decision model, or questions for a generation model, fit no wire the record speaks.
  if (request.kind !== planned.plan.kind) return failed({ code: "invalid", field: "protocol" })
  const http = steps.transport()
  const exit = await Effect.runPromiseExit(
    steps.outcome(
      planned,
      request,
      input !== undefined || planned.plan.protocol !== "openai-responses-chatgpt",
      http.layer
    )
  )
  const redirected = http.redirected()
  if (redirected !== undefined) return failed({ code: "refused", status: redirected })
  // A defect is a bug in this host, and its cause may hold a signed request: dropped, never logged or returned.
  if (!Exit.isSuccess(exit)) return failed({ code: "unreachable" })
  if ("failure" in exit.value) return failed(exit.value.failure)
  const { output } = exit.value
  return {
    ok: true,
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
    sample: modelCallSample(output, Redacted.value(planned.apiKey)),
    output
  }
}
