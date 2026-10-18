/**
 * `@smthrs/platform-cloudflare`, the Cloudflare host for durable flows.
 *
 * - `CloudflareHost`: the closed Host surface for a Worker or Durable Object.
 * - `CloudflareRuntime`: the durable engine for one execution, over an
 *   injected `SqlClient`.
 * - `ExecutionObject`: the per-execution Durable Object, as `start`, `wake`
 *   and `alarm` functions an Effect-native Durable Object delegates to; a
 *   `Router` reaches the objects of child and handoff executions.
 * - `EdgeCache`: `@smthrs/artifacts`' `ImmutableCache` over the Workers Cache
 *   API.
 *
 * ```ts
 * import { CloudflareRuntime, EdgeCache, ExecutionObject } from "@smthrs/platform-cloudflare"
 * ```
 *
 * Nothing here imports a `node:` built-in or a Cloudflare module, so the
 * package bundles for workerd and runs under Node for tests.
 *
 * @since 1.0.0
 */

/**
 * The closed Host surface for a Worker or Durable Object.
 *
 * @since 1.0.0
 */
export * as CloudflareHost from "./CloudflareHost.ts"

/**
 * The durable engine for one execution on Cloudflare.
 *
 * @since 1.0.0
 */
export * as CloudflareRuntime from "./CloudflareRuntime.ts"

/**
 * The per-execution Durable Object, as functions.
 *
 * @since 1.0.0
 */
export * as ExecutionObject from "./ExecutionObject.ts"

/**
 * The immutable cache over the Workers Cache API.
 *
 * @since 1.0.0
 */
export * as EdgeCache from "./EdgeCache.ts"
