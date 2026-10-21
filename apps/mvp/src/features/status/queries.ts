import { type Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import type { Effect } from "effect"
import type { Message } from "../chat/schema"
import type { Local, Run } from "./schema"

// What frontends read about the agent's status (decision 0015), each a live query over this device's collections:
// chat's synced `messages`, the synced `runs`, and this tab's own rows about each question (`local`). The answer's own
// settled status always wins over the run's row, so a report that never landed can't leave an answer looking live.

/**
 * Each answer's agent state, with its run's latest question: `done` or `failed` once the answer settled; while it
 * streams, `needs_you` while its question is open and unanswered, `waiting` while its turn waits, else `working`.
 * `focus` and `draft` are this tab's, for the open question only.
 */
export const statusesQuery = (
  messages: Collection.Collection<Message>,
  runs: Collection.Collection<Run>,
  local: Collection.Collection<Local, string>,
) =>
  LiveQuery.make((q) =>
    q
      .from({ message: messages.tanstack })
      .where(({ message }) => Query.eq(message.role, "assistant"))
      .leftJoin({ run: runs.tanstack }, ({ message, run }) => Query.eq(message.id, run.id))
      .leftJoin({ mine: local.tanstack }, ({ message, mine }) => Query.eq(message.id, mine.id))
      .select(({ message, run, mine }) => ({
        id: message.id,
        position: message.position,
        state: Query.caseWhen(
          Query.eq(message.status, "done"),
          "done",
          Query.eq(message.status, "failed"),
          "failed",
          Query.and(Query.eq(run?.status, "needs_you"), Query.isNull(run?.answeredAt)),
          "needs_you",
          Query.eq(run?.status, "waiting"),
          "waiting",
          "working",
        ),
        version: run?.version,
        wait: run?.wait,
        answer: run?.answer,
        sending: Query.caseWhen(Query.and(Query.eq(mine?.version, run?.version), Query.eq(mine?.sending, true)), true, false),
        draft: Query.caseWhen(Query.eq(mine?.version, run?.version), mine?.draft, ""),
        focus: Query.caseWhen(Query.eq(mine?.version, run?.version), mine?.focus, 0),
      }))
      .orderBy(({ $selected }) => $selected.position),
  )

/** Every answer's status. */
export type Statuses = Effect.Success<ReturnType<typeof statusesQuery>>

/**
 * The questions that need the person, oldest first, in every conversation: each run whose question is open and
 * unanswered, from the person's `runs` alone, so a question on a branch this tab never opened counts too. An answer in
 * the home conversation that already settled still wins over its run's row, as in `statusesQuery`; ChatApi fails a
 * run's row when it settles its answer itself (worker/flows/Expire.ts, worker/Answers.ts).
 */
export const needsQuery = (home: Collection.Collection<Message>, runs: Collection.Collection<Run>) =>
  LiveQuery.make((q) =>
    q
      .from({ run: runs.tanstack })
      .leftJoin({ message: home.tanstack }, ({ run, message }) => Query.eq(run.id, message.id))
      .where(({ run, message }) =>
        Query.and(
          Query.eq(run.status, "needs_you"),
          Query.isNull(run.answeredAt),
          Query.or(
            Query.isUndefined(message?.id),
            Query.not(Query.or(Query.eq(message?.status, "done"), Query.eq(message?.status, "failed"))),
          ),
        )
      )
      .select(({ run }) => ({ id: run.id, version: run.version, wait: run.wait, createdAt: run.createdAt }))
      .orderBy(({ $selected }) => $selected.createdAt),
  )

/** The questions that need the person. */
export type Needs = Effect.Success<ReturnType<typeof needsQuery>>

/** The latest answer's status in one conversation: what the header shows while it shows that conversation. */
export const latestQuery = (statuses: Statuses) =>
  LiveQuery.make((q) =>
    q
      .from({ status: statuses.tanstack })
      .orderBy(({ status }) => status.position, "desc")
      .limit(1),
  )

/**
 * The answers this device should deliver: answered on some device, while the run hasn't yet reported it working. The
 * device that holds the run delivers each; any other finds nothing to deliver.
 */
export const deliveriesQuery = (runs: Collection.Collection<Run>) =>
  LiveQuery.make((q) =>
    q
      .from({ run: runs.tanstack })
      .where(({ run }) => Query.and(Query.eq(run.status, "needs_you"), Query.not(Query.isNull(run.answeredAt))))
      .select(({ run }) => ({ id: run.id, version: run.version, wait: run.wait, answer: run.answer })),
  )
