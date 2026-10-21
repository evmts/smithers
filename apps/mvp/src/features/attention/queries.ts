import { type Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import type { Effect } from "effect"
import type { Entry } from "./schema"

// What frontends read of the feed (decision 0009 §4), each a live query over this tab's entries (store.ts): the toasts
// and the list behind `+N`, on a page and over a conversation.

/** Where an entry shows as a toast: on a page, or over a conversation. */
type StackField = "stack" | "stackHere"

/** The toasts, most urgent first: needs you, failed, live, done, updates. */
export const stackQuery = (entries: Collection.Collection<Entry, string>, field: StackField) =>
  LiveQuery.make((q) =>
    q
      .from({ entry: entries.tanstack })
      .where(({ entry }) => Query.eq(entry[field], true))
      .orderBy(({ entry }) => entry.order)
  )

/** The person's other entries, behind `+N`: in their list, and not a toast now. */
export const listQuery = (entries: Collection.Collection<Entry, string>, field: StackField) =>
  LiveQuery.make((q) =>
    q
      .from({ entry: entries.tanstack })
      .where(({ entry }) => Query.and(Query.eq(entry.listed, true), Query.eq(entry[field], false)))
      .orderBy(({ entry }) => entry.order)
  )

/** A list of entries, as the views read it. */
export type Entries = Effect.Success<ReturnType<typeof stackQuery>>
