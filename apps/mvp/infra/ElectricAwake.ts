// Keeps Electric's container running between visits. A Durable Object's container stops shortly after the object goes
// idle unless the object sets an inactivity timeout (Cloudflare: Durable Object Container API), and a stopped Electric
// loses its disk: the next page load waited for the container to start and Electric to rebuild every shape, and
// Electric answered each waiting shape request 503 meanwhile. On smithers.sh on 2026-10-22, every first load after 11
// or more idle minutes (12 of 12) got 503s from Electric, 53 of them on one load (docs/infrastructure.md#electric). So
// each request the gateway's object forwards holds the container for `INACTIVITY` after it, the most Cloudflare allows.
import { Duration, Effect } from "effect"

/**
 * How long the container keeps running after the object's last request: Cloudflare's maximum, 6 hours. A longer one
 * makes `setInactivityTimeout` reject. A deployment quiet for longer still starts Electric again on its next visit.
 */
export const INACTIVITY = Duration.hours(6)

/** What the gateway's object does to Electric's container. */
export interface Host<E = unknown, R = never> {
  /** Starts the container unless it is running. */
  readonly start: Effect.Effect<void, E, R>
  readonly setInactivityTimeout: (ms: number) => Effect.Effect<void, E, R>
}

/**
 * On a request: Electric started, then held for `INACTIVITY`. Set on every request, since a Durable Object restarted
 * (by a deploy, say) starts without a timeout. A hold Cloudflare refuses is logged, and the request still goes to
 * Electric, which then stops when idle as it did before.
 */
export const awake = <E, R>(host: Host<E, R>) =>
  Effect.andThen(
    host.start,
    host.setInactivityTimeout(Duration.toMillis(INACTIVITY)).pipe(
      Effect.catch((error) => Effect.logWarning("electric.hold").pipe(Effect.annotateLogs({ error: String(error) }))),
    ),
  )
