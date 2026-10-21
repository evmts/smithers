import type { Inbox } from "@smthrs/notifications"
import { Effect, Option } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { focus } from "../status/actions"
import type { Surface } from "./contract"
import { AttentionNavigation, AttentionStore } from "./store"

// What a person does with the feed (decision 0009 decision 10): open an entry, hide a toast, dismiss an entry. Each
// finishes at once: the act shows on this device straight away, kept on the device until the synced row shows it, and
// runs on as `notification/ack` (door `button`), one execution per subject, act and version.

/** Records `act` on entry `subject` at the version this tab shows: at once here, then through ChatApi. */
const record = (subject: string, act: Inbox.Act) =>
  Effect.gen(function* () {
    const { entries, pending, scope } = yield* AttentionStore
    const entry = yield* entries.get(subject)
    if (Option.isNone(entry)) return entry
    const { version } = entry.value
    const id = `${subject}:${act}`
    const held = yield* pending.get(id)
    if (Option.isSome(held) && held.value.version >= version) return entry
    if (Option.isSome(held)) yield* pending.update(id, (draft) => void (draft.version = version))
    else yield* pending.insert({ id, subject, act, version })
    const flows = yield* FlowDispatch
    yield* flows.dispatch("notification/ack", { subject, version, act }, {
      door: "button",
      executionId: `ack/${subject}/${act}/${version}`,
    }).pipe(Effect.ignore, Effect.forkIn(scope))
    return entry
  }).pipe(
    // A local collection refuses only a row its own schema rejects, which these never are: a bug, not a state.
    Effect.orDie,
  )

/** Hides entry `subject`'s toast: on every device, and it stays in the person's list. */
export const hide = (subject: string) => Effect.asVoid(record(subject, "hide"))

/** Dismisses entry `subject`: it leaves the person's list on every device. */
export const dismiss = (subject: string) => Effect.asVoid(record(subject, "dismiss"))

/**
 * Opens entry `subject` from `surface`: records Read, then brings the person to it. The person's own open question, on
 * the conversation it was asked in, takes focus there; anything else goes to its page, and a question takes focus once
 * its card shows.
 */
export const open = (subject: string, surface: Surface) =>
  Effect.gen(function* () {
    const entry = yield* record(subject, "read")
    if (Option.isNone(entry)) return
    const { here, action, runId, href } = entry.value
    if (surface !== "conversation" || !here) (yield* AttentionNavigation).navigate(href)
    // Its run is the answer it asks about: the question's card takes focus where it shows.
    if (action === "answer" && runId !== null) yield* focus(runId)
  })
