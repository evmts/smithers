// `cloudflare:workers` for timing a Worker bundle's module evaluation in Node (worker/ChatApi.startup.test.ts): the
// classes and values a module may read while it loads, none of which runs.
export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env } }
export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env } }
export class WorkflowEntrypoint {}
export class RpcTarget {}
export const env = {}
export const waitUntil = () => {}
export default {}
