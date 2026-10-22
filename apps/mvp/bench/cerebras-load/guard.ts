import { Model, ModelError, RequestExecutor, type ModelEvent } from '@smthrs/model'
import type { HostModel } from '@smthrs/model-host'
import { Effect, Exit, Stream } from 'effect'
import { openBudget } from './budget.ts'

/** Wrap the real SDK model used by the eval's durable steps; never call a provider outside those steps. */
export const guardedModel = (host: HostModel['Service'], budget: ReturnType<typeof openBudget>) => ({
  ...host,
  model: Model.make({
    providerName: host.model.providerName,
    stream: request => Stream.unwrap(Effect.suspend(() => {
      if (request.messages.some(m=>m.content.some(p=>!['text','tool-call','tool-result','thinking','reasoning'].includes(p.type)))) {
        throw new Error('Experiment budget only supports text and tools')
      }
      const output = request.params.maxTokens
      if (!Number.isSafeInteger(output) || output! <= 0) throw new Error('Experiment requires an explicit output limit')
      // Serialized tool schemas and message bodies, plus conservative protocol overhead; no cache discount.
      const id = budget.reserve(Buffer.byteLength(JSON.stringify(request)) + 4096, output!)
      if (!id) return Effect.fail(new ModelError.ModelError({ code: "quota_exceeded", providerCode: "experiment_budget", message: "Experiment admission refused before provider dispatch" }))
      let usage: ModelEvent.UsageEvent | undefined
      return Effect.succeed(host.model.stream(request).pipe(
        Stream.provideService(RequestExecutor.Retries, 0),
        Stream.tap(event => Effect.sync(() => { if (event.type === 'usage') usage = event })),
        Stream.onExit(exit => Effect.sync(() => {
          if (Exit.isSuccess(exit) && usage?.inputTokens !== undefined && usage.outputTokens !== undefined) budget.settle(id, usage.inputTokens, usage.outputTokens)
          // Missing usage retains the full durable reservation, including interrupted streams.
        })),
      ))
    })),
  }),
})
