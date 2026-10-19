/**
 * Agent mailboxes with durable batch receipts. Message text is data from another
 * agent, never instructions. Identity is a host label, not authentication.
 * @since 1.0.0
 */

import * as Journal from "@smthrs/journal/Journal"
import * as Event from "@smthrs/journal/JournalEvent"
import * as Redaction from "@smthrs/journal/Redaction"
import { Clock, Context, Effect, Layer, Schema } from "effect"

/**
 * Agent or channel address.
 * @category schemas
 * @since 1.0.0
 */
export const Address = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]{0,63}(:[A-Za-z0-9@#._-]{1,64})?$/))
/**
 * Decoded mailbox address.
 * @category models
 * @since 1.0.0
 */
export type Address = typeof Address.Type

/**
 * Message identity.
 * @category schemas
 * @since 1.0.0
 */
export const MessageId = Schema.String.check(Schema.isPattern(/^m-[0-9a-z]{16}$/))
/**
 * Decoded message identity.
 * @category models
 * @since 1.0.0
 */
export type MessageId = typeof MessageId.Type

/**
 * Message body.
 * @category schemas
 * @since 1.0.0
 */
export const Text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000))
/**
 * Decoded message body.
 * @category models
 * @since 1.0.0
 */
export type Text = typeof Text.Type

/**
 * Immutable admitted message.
 * @category schemas
 * @since 1.0.0
 */
export const Message = Schema.Struct({
  id: MessageId,
  seq: Schema.Int,
  at: Schema.String,
  from: Address,
  to: Address,
  kind: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-z][a-z-]{0,31}$/))),
  re: Schema.optional(MessageId),
  thread: MessageId,
  text: Text
})
/**
 * Immutable admitted message.
 * @category models
 * @since 1.0.0
 */
export type Message = typeof Message.Type
/**
 * Sender-supplied fields; excess properties are refused at admission.
 * @category schemas
 * @since 1.0.0
 */
export const SendInput = Schema.Struct({
  to: Address,
  text: Text,
  kind: Message.fields.kind,
  re: Message.fields.re,
  key: Schema.optional(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._:-]{1,128}$/)))
})
/**
 * Sender-supplied fields.
 * @category models
 * @since 1.0.0
 */
export type SendInput = typeof SendInput.Type
/**
 * Batch size, default twenty.
 * @category schemas
 * @since 1.0.0
 */
export const PullInput = Schema.Struct({
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })))
})
/**
 * Batch request.
 * @category models
 * @since 1.0.0
 */
export type PullInput = typeof PullInput.Type
/**
 * Receipt acknowledgment.
 * @category schemas
 * @since 1.0.0
 */
export const AckInput = Schema.Struct({ receipt: Schema.String.check(Schema.isMinLength(1)) })
/**
 * Receipt acknowledgment.
 * @category models
 * @since 1.0.0
 */
export type AckInput = typeof AckInput.Type
/**
 * Admission result.
 * @category models
 * @since 1.0.0
 */
export interface Sent {
  readonly id: string
  readonly seq: number
  readonly thread: string
  readonly duplicate: boolean
}
/**
 * Durable delivery batch.
 * @category models
 * @since 1.0.0
 */
export interface Batch {
  readonly messages: ReadonlyArray<Message>
  readonly receipt: string | null
  readonly more: boolean
}
/**
 * Acknowledgment result.
 * @category models
 * @since 1.0.0
 */
export interface Acked {
  readonly receipt: string
  readonly duplicate: boolean
}
/**
 * Safe refusal without sender text.
 * @category errors
 * @since 1.0.0
 */
export class MailboxError extends Schema.TaggedError<MailboxError>()("/notifications/MailboxError", {
  code: Schema.Literals([
    "message_invalid",
    "message_secret_refused",
    "message_forbidden",
    "message_key_reused",
    "agent_unknown",
    "receipt_invalid"
  ])
}) {}
/**
 * Mailbox operations.
 * @category models
 * @since 1.0.0
 */
export interface Service {
  readonly send: (input: SendInput) => Effect.Effect<Sent, MailboxError | Journal.JournalError>
  readonly pull: (input: PullInput) => Effect.Effect<Batch, MailboxError | Journal.JournalError>
  readonly ack: (input: AckInput) => Effect.Effect<Acked, MailboxError | Journal.JournalError>
}
/**
 * Address and access policy seam.
 * @category models
 * @since 1.0.0
 */
export interface Policy {
  readonly resolve: (to: string) => Effect.Effect<string, MailboxError>
  readonly mailboxes: (reader: string) => ReadonlyArray<string>
  readonly authorize: (from: string, to: string) => Effect.Effect<void, MailboxError>
}
/**
 * Identity routing with channels switched off.
 * @category constants
 * @since 1.0.0
 */
export const defaultPolicy: Policy = {
  resolve: (to) => Effect.succeed(to),
  mailboxes: (reader) => [reader],
  authorize: (_from, to) =>
    to.includes(":") ? Effect.fail(new MailboxError({ code: "message_forbidden" })) : Effect.void
}
/**
 * Durable mailbox service.
 * @category services
 * @since 1.0.0
 */
export class Mailbox extends Context.Service<Mailbox, Service>()("/notifications/Mailbox") {}

const stream = Event.RunId.make("flows.messages")
const sentType = "flows/messages/Sent"
const pulledType = "flows/messages/Pulled"
const ackedType = "flows/messages/Acked"
const decode = <S extends Schema.Top>(schema: S, input: unknown, code: MailboxError["code"] = "message_invalid") =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error", reportInput: false })(input).pipe(
    Effect.mapError(() => new MailboxError({ code }))
  )
// Journal payloads are decoded on replay as well as on admission.
const SentRecord = Schema.Struct({ message: Message })
const PulledRecord = Schema.Struct({
  receipt: Schema.String,
  ids: Schema.Array(MessageId),
  through: Schema.Int,
  more: Schema.Boolean
})
const AckedRecord = Schema.Struct({ receipt: Schema.String })

/**
 * Builds a mailbox over the injected journal.
 * @category layers
 * @since 1.0.0
 */
export const layer = (principal: string | undefined): Layer.Layer<Mailbox, never, Journal.Journal> =>
  Layer.effect(
    Mailbox,
    Effect.gen(function*() {
      const journal = yield* Journal.Journal
      const agent = decode(Address, principal, "agent_unknown").pipe(
        Effect.flatMap((value) =>
          value.includes(":") ? Effect.fail(new MailboxError({ code: "agent_unknown" })) : Effect.succeed(value)
        )
      )
      const entries = (runId: Event.RunId) =>
        Effect.gen(function*() {
          const result: Array<Event.Entry> = []
          let after: Event.Seq | undefined
          for (;;) {
            const page = yield* journal.entries({ runId, ...(after === undefined ? {} : { after }), limit: 512 })
            result.push(...page.entries)
            if (!page.hasMore) return result
            after = page.entries[page.entries.length - 1]!.seq
          }
        })
      const emit = (runId: Event.RunId, sourceId: string, eventType: string, payload: unknown) =>
        journal.emitDurableUnfenced(
          new Event.Input({
            runId,
            sourceId: Event.SourceId.make(sourceId),
            sourceSeq: Event.SourceSeq.make(0),
            eventType,
            payload
          })
        )
      const messages = () =>
        Effect.gen(function*() {
          const rows = yield* entries(stream)
          return yield* Effect.forEach(rows.filter((row) => row.eventType === sentType), (row) =>
            decode(SentRecord, row.payload).pipe(
              Effect.map((record) => ({
                ...record,
                message: { ...record.message, seq: row.seq },
                sourceId: row.sourceId
              }))
            ))
        })
      const readerState = (reader: string) =>
        Effect.gen(function*() {
          const runId = Event.RunId.make(`flows.messages.reader/${reader}`)
          const rows = yield* entries(runId)
          let pending: typeof PulledRecord.Type | undefined
          let through = -1
          const acked = new Set<string>()
          for (const row of rows) {
            if (row.eventType === pulledType) pending = yield* decode(PulledRecord, row.payload)
            if (row.eventType === ackedType) {
              const record = yield* decode(AckedRecord, row.payload)
              acked.add(record.receipt)
              if (pending?.receipt === record.receipt) {
                through = pending.through
                pending = undefined
              }
            }
          }
          return { runId, pending, through, acked }
        })
      return {
        send: (raw) =>
          Effect.gen(function*() {
            const from = yield* agent
            const input = yield* decode(SendInput, raw)
            if (
              [...input.text].some((char) => /\p{Cc}/u.test(char) && char !== "\n") ||
              /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input.text)
            ) {
              return yield* new MailboxError({ code: "message_invalid" })
            }
            if (Redaction.redact(input.text) !== input.text) {
              return yield* new MailboxError({ code: "message_secret_refused" })
            }
            const to = yield* defaultPolicy.resolve(input.to)
            yield* defaultPolicy.authorize(from, to)
            return yield* journal.transact(Effect.gen(function*() {
              const records = yield* messages()
              const sourceId = input.key === undefined ? undefined : `send/${from}/${input.key}`
              const prior = records.find((record) => record.sourceId === sourceId)
              if (prior !== undefined) {
                if (
                  JSON.stringify([prior.message.to, prior.message.text, prior.message.kind, prior.message.re]) !==
                    JSON.stringify([input.to, input.text, input.kind, input.re])
                ) return yield* new MailboxError({ code: "message_key_reused" })
                const { id, seq, thread } = prior.message
                return { id, seq, thread, duplicate: true }
              }
              const parent = input.re === undefined
                ? undefined
                : records.find((record) => record.message.id === input.re)?.message
              if (input.re !== undefined && parent === undefined) {
                return yield* new MailboxError({ code: "message_invalid" })
              }
              const id = `m-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`
              const at = new Date(yield* Clock.currentTimeMillis).toISOString()
              const rows = yield* entries(stream)
              const seq = rows.length === 0 ? 0 : rows[rows.length - 1]!.seq + 1
              const message: Message = {
                id,
                seq,
                at,
                from,
                to,
                text: input.text,
                thread: parent?.thread ?? id,
                ...(input.kind === undefined ? {} : { kind: input.kind }),
                ...(input.re === undefined ? {} : { re: input.re })
              }
              const receipt = yield* emit(stream, sourceId ?? `send/${id}`, sentType, {
                message
              })
              return { id, seq: receipt.seq, thread: message.thread, duplicate: false }
            }))
          }),
        pull: (raw) =>
          Effect.gen(function*() {
            const reader = yield* agent
            const input = yield* decode(PullInput, raw)
            return yield* journal.transact(Effect.gen(function*() {
              const state = yield* readerState(reader)
              const all = (yield* messages()).map((record) => record.message)
              if (state.pending !== undefined) {
                return {
                  messages: state.pending.ids.map((id) => all.find((message) => message.id === id)!),
                  receipt: state.pending.receipt,
                  more: state.pending.more
                }
              }
              const unread = all.filter((message) =>
                message.seq > state.through && defaultPolicy.mailboxes(reader).includes(message.to)
              )
              const selected: Array<Message> = []
              for (const message of unread) {
                if (selected.length >= (input.limit ?? 20)) break
                if (
                  selected.length > 0 &&
                  new TextEncoder().encode(
                      JSON.stringify({ messages: [...selected, message], receipt: "r-" + "0".repeat(36), more: false })
                    ).length > 65536
                ) break
                selected.push(message)
              }
              if (selected.length === 0) return { messages: [], receipt: null, more: false }
              const receipt = `r-${crypto.randomUUID()}`
              const more = unread.length > selected.length
              yield* emit(state.runId, receipt, pulledType, {
                receipt,
                ids: selected.map((message) => message.id),
                through: selected[selected.length - 1]!.seq,
                more
              })
              return { messages: selected, receipt, more }
            }))
          }),
        ack: (raw) =>
          Effect.gen(function*() {
            const reader = yield* agent
            const input = yield* decode(AckInput, raw, "receipt_invalid")
            return yield* journal.transact(Effect.gen(function*() {
              const state = yield* readerState(reader)
              if (state.acked.has(input.receipt)) return { receipt: input.receipt, duplicate: true }
              if (state.pending?.receipt !== input.receipt) return yield* new MailboxError({ code: "receipt_invalid" })
              yield* emit(state.runId, `ack/${input.receipt}`, ackedType, input)
              return { receipt: input.receipt, duplicate: false }
            }))
          })
      }
    })
  )
