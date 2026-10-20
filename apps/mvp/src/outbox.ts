import type { Collection, Outbox } from "@smthrs/effect-tanstack-db"
import { Context } from "effect"

// The device has one durable outbox (decision 0002 §3), which chat's store builds and leads
// (src/features/chat/store.ts). A feature that writes through it hands its writes over here, from a layer built below
// chat's store: the collections its writes' optimistic rows go in and the mutations that send them, each under a name
// that never changes, because a stored write names its collection and its mutation by them. Each mutation has its
// services already: it runs as the outbox sends it, in whichever tab leads.

/** The writes features send through the device's outbox besides chat's own questions. */
export class OutboxWrites extends Context.Service<
  OutboxWrites,
  {
    // A collection's row type is the feature's own, as `Outbox.Options` declares its collections: the outbox only
    // restores rows into it by name.
    readonly collections: Readonly<Record<string, Collection.Collection<any, any, any>>>
    readonly mutations: Readonly<Record<string, Outbox.Mutation<never>>>
  }
>()("@smthrs/mvp/OutboxWrites") {}
