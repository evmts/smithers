import { Effect, Layer, Schema } from "effect"
import { answerAskingTab } from "./askingTab"
import { doorChannel } from "./contract"

// The tab's side of run credentials (decision 0017 slice 0, src/flows/credentials.ts): before a root run of a person's
// flow sends its first request, the engine asks which door it came through, and only the tab that dispatched it answers
// (src/flows/askingTab.ts), with the door it remembers (`TabRequests`). A person door means the person's own press. No
// answer, from a tab closed or reloaded since, means the run gets a credential, as any run nobody pressed does.

/** What the engine asks, and what the tab answers besides the door every reply carries: nothing more. */
export const DoorCall = Schema.Struct({})

/** Answers engine `name`'s door channel for this tab's dispatches until its scope closes. */
export const tabDoors = (host: { readonly name: string }) =>
  Layer.effectDiscard(answerAskingTab({ channel: doorChannel(host.name), input: DoorCall, answer: () => Effect.succeed({}) }))
