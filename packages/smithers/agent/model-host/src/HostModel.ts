/**
 * The model a host answers with, chosen by configuration rather than code:
 * the provider's model id and the `Model` that serves it.
 *
 * `layerConfig` reads a configured-model record (@smthrs/rpc/ConfiguredModel)
 * and its credential through Effect `Config`, so whatever `ConfigProvider` the
 * host installs supplies them: the environment on Node or Bun, the Worker's
 * bindings on Cloudflare. A key only ever goes to an origin it is pinned to.
 *
 * @since 1.0.0
 */

import { type Model, RequestExecutor } from "@smthrs/model"
import { ConfiguredModel } from "@smthrs/rpc"
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { toModel } from "./ConfiguredModelRoute.ts"
import { providerTransport } from "./ProviderTransport.ts"

/**
 * A configured-model record without its name: what `layerConfig` reads.
 *
 * @category models
 * @since 1.0.0
 */
export interface HostModelRecord {
  readonly protocol: string
  readonly baseUrl?: string | undefined
  readonly path?: string | undefined
  readonly modelId: string
  readonly credential: string
}

/**
 * How `HostModel` reaches its provider.
 *
 * @category models
 * @since 1.0.0
 */
export interface HostModelOptions {
  /** The fetch provider calls go through, wrapped to refuse redirects. Defaults to the runtime's global fetch. */
  readonly fetch?: typeof globalThis.fetch | undefined
}

const RecordJson = Schema.fromJsonString(
  Schema.Struct({
    protocol: Schema.String,
    baseUrl: Schema.optional(Schema.String),
    path: Schema.optional(Schema.String),
    modelId: Schema.String,
    credential: Schema.String
  })
)

/**
 * The host's model: the provider model id every request names, and the
 * `Model` that streams it.
 *
 * @category services
 * @since 1.0.0
 */
export class HostModel extends Context.Service<HostModel, {
  readonly modelId: string
  readonly model: Model.Model
}>()("@smthrs/model-host/HostModel") {
  /**
   * Provides a validated generation plan and its credential. Provider calls go
   * over a transport that refuses redirects, so the key never leaves the
   * planned origin. `fetch` defaults to the runtime's global fetch.
   *
   * @category layers
   * @since 1.0.0
   */
  static readonly layer = (
    plan: ConfiguredModel.ModelPlan,
    apiKey: Redacted.Redacted<string>,
    options: HostModelOptions = {}
  ): Layer.Layer<HostModel> =>
    Layer.effect(
      HostModel,
      // A plan from planModelBinding always routes, so a refusal here is a defect.
      Effect.map(Effect.orDie(toModel(plan, apiKey)), (model) => HostModel.of({ modelId: plan.modelId, model }))
    ).pipe(Layer.provide(RequestExecutor.layer.pipe(Layer.provide(providerTransport(options.fetch)))))

  /**
   * Provides the model a configured-model record names. The record is JSON
   * under `name` (or `fallback` when unset). A built-in credential's key is
   * read under its own name (`CEREBRAS_API_KEY`); a custom credential `NAME`
   * reads `SMITHERS_MODEL_KEY_NAME` and its origin `SMITHERS_MODEL_KEY_NAME_ORIGIN`. A record this host cannot use stops the host with
   * the planner's reason.
   *
   * @category layers
   * @since 1.0.0
   */
  static readonly layerConfig = (
    name: string,
    fallback?: HostModelRecord,
    options: HostModelOptions = {}
  ): Layer.Layer<HostModel, Config.ConfigError> =>
    Layer.unwrap(Effect.gen(function*() {
      const configured = Config.schema(RecordJson, name)
      const record = yield* (fallback === undefined ? configured : configured.pipe(Config.withDefault(fallback)))
      const keyName = ConfiguredModel.modelCredentialEnvName(record.credential)
      const apiKey = yield* Config.Redacted(keyName)
      const originName = `${keyName}${ConfiguredModel.MODEL_CREDENTIAL_ORIGIN_SUFFIX}`
      const origin = yield* Config.option(Config.String(originName))
      const planned = ConfiguredModel.planModelBinding(
        record,
        ConfiguredModel.hostModelCredentials({
          [keyName]: Redacted.value(apiKey),
          [originName]: Option.getOrUndefined(origin)
        }),
        { kind: "generation" }
      )
      if (!planned.ok) return yield* Effect.die(new Error(`${name} is not usable: ${JSON.stringify(planned.failure)}`))
      return HostModel.layer(planned.plan, apiKey, options)
    }))
}
