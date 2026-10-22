// The production database's compute size and how its connections are shared out. No imports: the Electric gateway's
// Worker reads its pool size from here, and Alchemy's Neon module, which infra/Postgres.ts imports, imports node:crypto.

/**
 * The production compute's autoscaling range, in Neon compute units. Neon's default is a fixed 0.25 CU, whose
 * `max_connections` is 112: on 2026-10-22 Hyperdrive's 60 origin connections, Electric's pool and the deploy's own
 * held 91 of them under load, and the compute stopped accepting logins until it was restarted. Neon sizes
 * `max_connections` by the range's top, about 450 per CU, and the compute idles at the bottom.
 */
export const COMPUTE_MIN_CU = 0.25
export const COMPUTE_MAX_CU = 1

/** The `max_connections` Neon gives a compute of `cu` units: 112 at 0.25, 450 at 1 (Neon's connection limits table). */
export const maxConnections = (cu: number) => Math.min(4000, Math.floor(cu * 450))

/**
 * The share of `max_connections`, in percent, the budget stays under. Connections in use past it alert the deployment's
 * Admins (`ops/DatabaseLoad`, worker/flows/DatabaseLoad.ts): a client over its cap, or something else holding
 * connections, before the compute stops accepting logins.
 */
export const ALERT_PERCENT = 80

/**
 * The most server connections each client of the production database may hold. Their sum stays under `ALERT_PERCENT`
 * of the `max_connections` of the range's bottom, so the budget holds even if Neon sized by it
 * (docs/infrastructure.md#connections):
 * - `hyperdrive`: the `ChatDatabase` config's origin connection limit. Every Worker, ChatApi's requests and every
 *   `FlowExecution` alarm, shares it; `@smthrs/database` writers let theirs go after 2 seconds of waiting for the engine
 *   schema's writer lock, so a queue of them can't hold it all.
 * - `electric`: Electric's query pool (`ELECTRIC_DB_POOL_SIZE`) and its one replication connection.
 * - `deploy`: the deploy's migrations and an operator's `psql`.
 * - `reserved`: what Neon keeps for itself and superusers.
 */
export const CONNECTION_BUDGET = { hyperdrive: 50, electric: 20 + 1, deploy: 5, reserved: 13 } as const

/** Electric's query pool: the `electric` budget less its replication connection. */
export const ELECTRIC_POOL_SIZE = CONNECTION_BUDGET.electric - 1
