// The Electric gateway Worker: answers `GET /v1/shape` carrying Electric's secret by forwarding it to the one
// Durable Object that runs Electric's container, and refuses everything else before the container starts.
// alchemy.run.ts declares it in production only; ChatApi reaches it at its workers.dev URL (infra/Electric.ts).
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect, Redacted } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { ElectricSecret } from "./Electric.ts"
import { directUrl, Postgres } from "./Postgres.ts"

/** The Electric release the app is built against; docker-compose.yml runs the same one. */
const IMAGE = "electricsql/electric:1.8.1"

/** The port Electric serves its HTTP API on inside the image. */
const PORT = 3000

/** The one Durable Object, and so the one container, every shape request goes to. */
const INSTANCE = "electric"

/**
 * Electric itself, on Postgres' direct host with its secret set. Its storage directory is the container's disk, which
 * a restart empties: Electric then rebuilds its shapes and clients refetch (docs/infrastructure.md#limits).
 */
class Electric extends Cloudflare.Container<Electric>()(
  "Electric",
  Effect.gen(function* () {
    const postgres = yield* Postgres
    const secret = yield* ElectricSecret
    return {
      image: IMAGE,
      // 1/4 vCPU, 1 GiB of memory and 4 GB of disk; the default `lite` (256 MiB) is too small for Electric.
      instanceType: "basic",
      maxInstances: 1,
      env: {
        DATABASE_URL: directUrl(postgres),
        ELECTRIC_SECRET: secret.text,
      },
    }
  }),
) {}

/** Starts Electric's container when a request needs it, and forwards the request to its port. */
class ElectricObject extends Cloudflare.DurableObject<ElectricObject>()(
  "ElectricObject",
  Effect.gen(function* () {
    const electric = yield* Electric
    return Effect.gen(function* () {
      const port = yield* electric.getTcpPort(PORT)
      return {
        fetch: Effect.gen(function* () {
          // Electric reaches Postgres over the internet.
          yield* electric.start({ enableInternet: true })
          return yield* port.fetch(yield* HttpServerRequest.HttpServerRequest)
        }),
      }
    })
  }),
) {}

export default class ElectricGateway extends Cloudflare.Worker<ElectricGateway>()(
  "ElectricGateway",
  {
    main: "infra/ElectricGateway.ts",
    // Alchemy's Neon module, which the container's declaration names, imports node:crypto.
    compatibility: { date: "2026-10-01", flags: ["nodejs_compat"] },
    // Only the stable workers.dev URL, which ChatApi calls; no per-version preview URLs.
    workersDev: { enabled: true, previewsEnabled: false },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: true, persist: true },
      traces: { enabled: true, persist: true },
    },
  },
  Effect.gen(function* () {
    const objects = yield* ElectricObject
    const secret = yield* (yield* ElectricSecret).text
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://electric")
        if (request.method !== "GET" || url.pathname !== "/v1/shape") {
          return HttpServerResponse.empty({ status: 404 })
        }
        if (url.searchParams.get("secret") !== Redacted.value(yield* secret)) {
          return HttpServerResponse.empty({ status: 401 })
        }
        return yield* objects.getByName(INSTANCE).fetch(request)
      }),
    }
  }),
) {}
