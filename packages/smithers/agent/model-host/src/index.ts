/**
 * Shared model streaming, durable producer, and trusted host bindings.
 *
 * Every module here runs on every platform Smithers supports: Node, Bun, a
 * browser and a Cloudflare Worker. What only one platform can do is injected
 * by the host composition, never imported: the Node model host passes
 * `FetchTransport.observe` from `@smthrs/platform-node` as its
 * `CallbackTransportObserver`. Import from this root entry only.
 *
 * @since 1.0.0-rc.0
 */

export * from "./CallbackTransport.ts"
export * from "./ConfiguredModelRoute.ts"
export * from "./ContextPreflight.ts"
export * from "./DurableChatProducer.ts"
export * from "./EnvironmentResolver.ts"
export * from "./FastModelFallback.ts"
export * from "./HostDiagnostics.ts"
export * from "./HostModel.ts"
export * from "./HostServer.ts"
export * from "./HostTools.ts"
export * from "./LocalModel.ts"
export * from "./ModelHostError.ts"
export * from "./ModelProbe.ts"
export * from "./ModelTurnHost.ts"
export * from "./ProviderTransport.ts"
