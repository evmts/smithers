/**
 * Alchemy stack for the from-scratch app. Importing it deploys nothing.
 *
 * Production (`pnpm deploy`, stage `prod`) declares every dependency:
 * - Postgres: a Neon project with logical replication on (infra/Postgres.ts), migrated by a deploy step.
 * - Hyperdrive: the `ChatDatabase` config in front of Postgres, created after the migrations ran (infra/ChatDatabase.ts).
 * - Electric: `electricsql/electric:1.8.1` in a Cloudflare Container behind the ElectricGateway Worker, which answers
 *   only shape requests that carry Electric's generated secret (infra/ElectricGateway.ts).
 * - ChatApi (worker/ChatApi.ts): an Effect-native Worker that answers /api/*: questions, the Electric shape proxy,
 *   the browser's telemetry, the model endpoint and sign-in. It reaches Postgres through Hyperdrive. Alchemy runs its
 *   handlers.
 * - SessionSecret (infra/SignIn.ts): a random secret Alchemy generates once, bound to ChatApi as SESSION_SECRET; it
 *   signs session cookies and seals GitHub's tokens (docs/features/sign-in.md).
 * - SecretsKey (infra/Secrets.ts): a random secret Alchemy generates once, bound to ChatApi as SECRETS_KEY; repository
 *   secrets are sealed and sandbox placeholders derived under it (docs/features/secrets.md#keys).
 * - FlowExecution (worker/Executions.ts): the Durable Object ChatApi hosts, one per remote flow execution, which runs
 *   the durable flow engine over Postgres (schema smithers_flows) through the same Hyperdrive config
 *   (docs/features/remote-flows.md). Declaring ChatApi declares it.
 * - The site (Vite build + worker/index.ts): serves the app and hands /api/* to ChatApi over a service binding.
 *
 * Under `alchemy dev` (`pnpm dev`), Postgres and Electric are the compose services (`pnpm db:up`): no Neon project,
 * container or gateway is declared, and Hyperdrive passes through to DATABASE_URL.
 *
 * Dev:     pnpm dev        (alchemy dev: Vite + both Workers in local workerd, state in .alchemy/)
 * Plan:    pnpm plan       (alchemy plan --stage prod; read-only)
 * Deploy:  pnpm deploy     (the credentials in docs/infrastructure.md#credentials)
 * Destroy: pnpm destroy    (keeps the Neon project)
 *
 * ChatApi reads its settings with Effect Config; see docs/features/chat.md#configuration.
 */
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Neon from "alchemy/Neon"
import type { State } from "alchemy/State"
import { Effect, Layer } from "effect"
import { ChatDatabase } from "./infra/ChatDatabase.ts"
import * as Electric from "./infra/Electric.ts"
import ElectricGateway from "./infra/ElectricGateway.ts"
import * as Secrets from "./infra/Secrets.ts"
import * as SignIn from "./infra/SignIn.ts"
import ChatApi from "./worker/ChatApi.ts"
import DevChatApi from "./worker/DevChatApi.ts"

// Local dev keeps state in .alchemy/ with no Cloudflare account; deploys keep it in the account's state store.
const stateFor = (dev: boolean): Layer.Layer<State, never, Alchemy.StackServices> =>
  dev ? Alchemy.localState() : Cloudflare.state()
const state = Layer.unwrap(Effect.gen(function* () {
  return stateFor(yield* Alchemy.ALCHEMY_DEV)
})).pipe(Layer.orDie)

/** Production: Electric's gateway URL and secret, for ChatApi to bind. `undefined` under `alchemy dev`. */
const electric = Effect.gen(function* () {
  if (yield* Alchemy.ALCHEMY_DEV) return undefined
  const gateway = yield* ElectricGateway
  const secret = yield* Electric.ElectricSecret
  return Electric.Endpoint.of({ url: gateway.url, secret: secret.text })
})

export default Alchemy.Stack(
  "smithers-mvp",
  { providers: Layer.mergeAll(Cloudflare.providers(), Neon.providers()), state },
  Effect.gen(function* () {
    // Declared before ChatApi, so ChatApi's `ChatDatabase` is this one: Neon's in production, compose's in dev.
    yield* ChatDatabase
    const endpoint = yield* electric
    // Sign-in's secret, in production and under `alchemy dev` alike (docs/features/sign-in.md#configuration).
    const sessionSecret = SignIn.Secret.of({ value: (yield* SignIn.SessionSecret).text })
    // Repository secrets' key, in production and under `alchemy dev` alike (docs/features/secrets.md#keys).
    const secretsKey = Secrets.Secret.of({ value: (yield* Secrets.SecretsKey).text })
    // Under `alchemy dev`, a local developer is signed in until the GitHub App is configured (worker/DevChatApi.ts).
    const chatApi = yield* (endpoint
      ? ChatApi.pipe(Effect.provideService(Electric.Endpoint, endpoint))
      : (yield* Alchemy.ALCHEMY_DEV)
      ? DevChatApi
      : ChatApi).pipe(Effect.provideService(SignIn.Secret, sessionSecret), Effect.provideService(Secrets.Secret, secretsKey))
    const site = yield* Cloudflare.Website.Vite("smithers-mvp", {
      main: "worker/index.ts",
      compatibility: { date: "2026-10-01", flags: ["enable_request_signal"] },
      // The Worker answers /api/*; every other path is the single-page app.
      assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*"] },
      env: { CHAT_API: chatApi },
      // Workers Logs and Traces for the site's requests, kept like ChatApi's.
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true, persist: true },
        traces: { enabled: true, persist: true },
      },
    })
    return { url: site.url }
  }),
)
