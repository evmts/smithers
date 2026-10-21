import { HostModel } from '@smthrs/model-host'
import { ModelRequest } from '@smthrs/model'
import { Action, Interpreter } from '@smthrs/flow'
import { EgressHttpClient, TestNodeRuntime } from '@smthrs/platform-node'
import { Effect, Layer, Stream } from 'effect'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import { fileURLToPath } from 'node:url'
import { summarize, reserve } from './stats.ts'
import { report } from './report.ts'
import Call, { Probe } from '../../../../.smithers/flows/cerebras-load/flow.ts'

const directory = fileURLToPath(new URL(`./results/${new Date().toISOString().replaceAll(':','-')}/`, import.meta.url))
mkdirSync(directory, { recursive: true })
const rows: any[] = []
const pending = new Map<number, any>()
const context = new AsyncLocalStorage<any>()
let nativeFetch: typeof globalThis.fetch
const observedFetch: typeof fetch = async (input, init) => {
  let response: Response
  try { response = await nativeFetch(input, init) } catch (error) {
    const row = context.getStore()
    const code = (error as any)?.cause?.code
    if (row) row.transportCode = typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'unclassified'
    throw error
  }
  const row = context.getStore()
  if (row) {
    row.status = response.status
    row.headers = Object.fromEntries([...response.headers].filter(([k]) => /^(x-ratelimit-|ratelimit-|retry-after$)/i.test(k)))
  }
  return response
}
const record = { protocol: 'openai-chat', baseUrl: 'https://api.cerebras.ai', modelId: 'qwen-3.8-27b', credential: 'CEREBRAS_API_KEY' }
const sentence = 'The repository contains a local first chat application. A user asks to inspect a failing build, identify the smallest correct change, verify the result and report the evidence. The agent reads source files, compares expected behavior with actual behavior, runs focused checks and preserves existing changes. Network failures must remain visible and work must resume safely after interruption. '
const prompt = (long: boolean, id: number) => `Request ${id}. You are helping maintain a team software project. Review this synthetic project context and propose a practical debugging plan in about 220 words.\n${sentence.repeat(long ? 100 : 21)}\nExplain the likely failure points, which checks to run first, and how to confirm recovery.`
let nextId = 0, charged = 0, cost = 0, reason = 'ramp_complete'
if (process.env.CHAT_MODEL) throw new Error('Unset CHAT_MODEL: this capped benchmark prices only the default Cerebras Qwen route')
const tokenCap = Number(process.env.CEREBRAS_LOAD_TOKEN_CAP ?? 2_000_000)
if (!Number.isInteger(tokenCap) || tokenCap <= 0 || tokenCap > 2_000_000) throw new Error('Invalid lower token cap')
const seconds = Number(process.env.CEREBRAS_LOAD_SECONDS ?? 60)
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) throw new Error('seconds must be in (0,60]')
const steps: any[] = []
const program = Effect.gen(function* () {
  const host = yield* HostModel
  const implementation = Probe.toLayer(({ id }) => Effect.tryPromise(() => context.run(pending.get(id), async () => {
    const row = pending.get(id)
    const started = performance.now()
    await Effect.runPromise(Stream.runForEach(host.model.stream(ModelRequest.ModelRequest.make({
      modelId: host.modelId, system: [], messages: [ModelRequest.Message.user(prompt(row.long, id))], tools: [], params: ModelRequest.GenerationParams.make({ maxTokens: 256, reasoningEffort: "none" })
    })), event => Effect.sync(() => {
      if ((event.type === 'text-delta' || event.type === 'thinking-delta') && event.text && row.ttftMs === null) row.ttftMs = performance.now() - started
      if (event.type === 'settle') row.stopReason = event.stopReason
      if (event.type === 'usage') { row.inputTokens = event.inputTokens ?? row.inputTokens; row.outputTokens = event.outputTokens ?? row.outputTokens }
    })).pipe(Effect.timeout('45 seconds'), Effect.catch(e => Effect.sync(() => { row.error = typeof e?.code === 'string' ? e.code : 'timeout_or_transport'; if (e?.timing) row.timing = e.timing }))))
    row.totalMs = performance.now() - started
    row.success = !row.error && row.status === 200 && row.inputTokens !== null && row.outputTokens !== null
  })).pipe(Effect.catch(() => Effect.sync(() => { const row = pending.get(id); row.error = 'client_failure'; row.success = false }))))
  const runner = Effect.gen(function* () {
    const run = yield* Effect.context()
    for (const concurrency of [10,25,50]) {
      const start = performance.now(), startIndex = rows.length
      yield* Effect.promise(async () => {
        await Promise.all(Array.from({length: concurrency}, async () => {
          while (performance.now() - start < seconds * 1000 && reason === 'ramp_complete') {
            const id = nextId++, long = id % 20 === 19
            const text = prompt(long, id)
            // UTF-8 byte count is a conservative upper bound for this ASCII prompt's input tokens.
            const reservation = reserve(charged, cost, Buffer.byteLength(text) + 128, 256, tokenCap)
            if (!reservation) { reason = 'hard_budget_reservation'; break }
            charged += reservation.tokens; cost += reservation.usd
            const row: any = { id, concurrency, long, startedAt: new Date().toISOString(), status: null, headers: {}, ttftMs: null, totalMs: null, inputTokens: null, outputTokens: null, success: false }
            pending.set(id, row)
            await context.run(row, () => Effect.runPromiseWith(run)(Call.execute({id}, {executionId: `probe-${id}`})))
            const known = row.inputTokens !== null && row.outputTokens !== null
            const cleanRefusal = row.status >= 400 && row.status < 500 && row.ttftMs === null
            row.chargedTokens = known ? row.inputTokens + row.outputTokens : cleanRefusal ? 0 : reservation.tokens
            row.estimatedUsd = known ? (row.inputTokens * .99 + row.outputTokens * 1.49)/1e6 : cleanRefusal ? 0 : reservation.usd
            charged += row.chargedTokens - reservation.tokens; cost += row.estimatedUsd - reservation.usd
            pending.delete(id)
            rows.push(row); appendFileSync(`${directory}/requests.jsonl`, JSON.stringify(row)+'\n')
          }
        }))
      })
      const summary = summarize(rows.slice(startIndex), (performance.now()-start)/1000)
      steps.push({concurrency, ...summary}); console.log(JSON.stringify(steps.at(-1)))
      writeFileSync(`${directory}/raw.json`, JSON.stringify({startedAt: directory.split('/').at(-2), model: record, seconds, tokenCap, chargedTokens: charged, estimatedUsd: cost, stopReason: reason, steps, requests: rows}, null, 2))
      if (reason !== 'ramp_complete') break
      if (summary.errorFraction > .2) { reason = 'errors_above_20_percent'; break }
    }
  }).pipe(Effect.provide(Layer.mergeAll(implementation, Interpreter.layer(Call)).pipe(Layer.provideMerge(Action.layerImplementations), Layer.provideMerge(TestNodeRuntime.durableEngine(`${directory}/journal.sqlite`, 'cerebras-load')))))
  yield* runner
}).pipe(Effect.provide(Layer.unwrap(Effect.map(EgressHttpClient.providerFetch(process.env), fetch => {
  nativeFetch = fetch
  return HostModel.layerConfig('CHAT_MODEL', record, {fetch: observedFetch})
}))), Effect.scoped)
try { await Effect.runPromise(program) } catch (e) { console.error(String(e?.stack).split('\n').filter(l => l.trim().startsWith('at ')).join('\n')); reason = 'runtime_failure'; console.error('Benchmark runtime failed; no credential or provider body logged.') }
writeFileSync(`${directory}/raw.json`, JSON.stringify({model: record, seconds, tokenCap, chargedTokens: charged, estimatedUsd: cost, stopReason: reason, steps, requests: rows}, null, 2))
console.log(JSON.stringify({directory, stopReason: reason, chargedTokens: charged, estimatedUsd: cost}))

report(directory)
if (reason === 'runtime_failure') process.exitCode = 1
