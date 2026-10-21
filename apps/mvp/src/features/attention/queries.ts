import { type Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import type { Effect } from "effect"
import type { Detail, Entry, Panel } from "./schema"

// What frontends read of the feed (decision 0009 §4), each a live query over this tab's collections (store.ts): the
// toasts and the rest of the person's list, on a page and over a conversation; and the notifications panel: its
// entries, the unread count, its state and the expanded entry's detail.

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

/** The person's other entries, which `+N` counts: in their list, and not a toast now. */
export const listQuery = (entries: Collection.Collection<Entry, string>, field: StackField) =>
  LiveQuery.make((q) =>
    q
      .from({ entry: entries.tanstack })
      .where(({ entry }) => Query.and(Query.eq(entry.listed, true), Query.eq(entry[field], false)))
      .orderBy(({ entry }) => entry.order)
  )

/** A list of entries, as the views read it. */
export type Entries = Effect.Success<ReturnType<typeof stackQuery>>

/** The notifications panel's entries: every one in the person's list, newest first. */
export const feedQuery = (entries: Collection.Collection<Entry, string>) =>
  LiveQuery.make((q) =>
    q
      .from({ entry: entries.tanstack })
      .where(({ entry }) => Query.eq(entry.listed, true))
      .orderBy(({ entry }) => entry.atMs, "desc")
  )

/** The person's unread entries: the bell counts them. */
export const unreadQuery = (entries: Collection.Collection<Entry, string>) =>
  LiveQuery.make((q) =>
    q
      .from({ entry: entries.tanstack })
      .where(({ entry }) => Query.and(Query.eq(entry.listed, true), Query.eq(entry.unread, true)))
  )

/** The person's own runs waiting on them: the bell's `Needs you`, newest first. */
export const needsQuery = (entries: Collection.Collection<Entry, string>) =>
  LiveQuery.make((q) =>
    q
      .from({ entry: entries.tanstack })
      .where(({ entry }) =>
        Query.and(Query.eq(entry.listed, true), Query.and(Query.eq(entry.mine, true), Query.eq(entry.state, "needs_you")))
      )
      .orderBy(({ entry }) => entry.atMs, "desc")
  )

/** The panel's one row. */
export const panelQuery = (panel: Collection.Collection<Panel, string>) =>
  LiveQuery.make((q) => q.from({ panel: panel.tanstack }).findOne())

/** The expanded entry's detail, if one is expanded. */
export const detailQuery = (details: Collection.Collection<Detail, string>) =>
  LiveQuery.make((q) => q.from({ detail: details.tanstack }).findOne())
