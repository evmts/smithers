import { Effect, Metric } from "effect"
import type { Door } from "../../flows/dispatch"
import type { WebMode, WebOutcome } from "./contract"
import type { Refusal } from "./url"

// What web pages count and log (docs/features/web-pages.md#observability): one count and one log line per opening,
// written where its door is known. The agent's openings are recorded by the flow's steps in the engine worker; a
// person's by the tab that dispatched it, once the flow answers, or at once when their own `/web` opened the tab. Never a
// URL, an origin or a path.

/** Pages opened, by `web_mode` (`embed` or `tab`), `door` and `outcome`. */
export const pagesOpened = Metric.counter("smithers_web_pages_opened", {
  description: "Web pages app/web/open opened, by mode, door and outcome",
  incremental: true,
})

/** What one record says. */
export interface Opening {
  readonly mode: WebMode
  readonly door: Door
  readonly outcome: WebOutcome
  readonly reason?: Refusal
}

/**
 * Records one opening: a count of `pagesOpened`, the log line `web.page.open` (Warn when nothing was shown) and the
 * outcome on the current span.
 */
export const recordOpening = (opening: Opening) =>
  Effect.gen(function* () {
    const { mode, door, outcome, reason } = opening
    // `web_mode`, not `mode`: the relay keeps a field by name for every record, and `mode` is the theme flow's input.
    yield* Metric.update(Metric.withAttributes(pagesOpened, { web_mode: mode, door, outcome }), 1)
    yield* Effect.annotateCurrentSpan({ "smithers.web.outcome": outcome })
    const shown = outcome === "embedded" || outcome === "card" || outcome === "opened"
    yield* Effect.logWithLevel(shown ? "Info" : "Warn")("web.page.open").pipe(
      Effect.annotateLogs({ web_mode: mode, door, outcome, ...(reason === undefined ? {} : { reason }), feature: "web" }),
    )
  })

/** Runs `effect` inside the span `web.page.open`, with the opening's mode. */
export const withOpenSpan = (mode: WebMode) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.withSpan(effect, "web.page.open", { attributes: { "smithers.web.mode": mode } })
