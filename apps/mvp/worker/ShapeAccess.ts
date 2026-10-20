import { ShapeProxy } from "@smthrs/effect-electric"
import { Effect } from "effect"
import { Sessions } from "./Actor.ts"

// What a shape route answers when it can't decide whose rows to serve. A device holds each shape's `handle` and
// `offset`; serving another `where` under them makes Electric answer `409 must-refetch`, and the device empties its
// copy. So a session store or database that can't answer refuses the request instead (`ShapeProxy.Refused`, 503): the
// device keeps its rows and retries under its sync policy (decision 0008 §5).

/** How long a device waits before asking again, in seconds; its own sync policy may wait longer. */
export const RETRY_AFTER_SECONDS = 5

/** The refusal of a shape request the server can't decide right now. */
export const unavailable = new ShapeProxy.Refused({ status: 503, retryAfter: RETRY_AFTER_SECONDS })

/** Who is asking for a shape: signed out is none; a session store that can't answer is `unavailable`. */
export const actor = Effect.gen(function* () {
  return yield* (yield* Sessions).resolve
}).pipe(Effect.mapError(() => unavailable))
