---
title: "Send by email and Telegram"
description: "Configure the email and Telegram channels, send one message from a durable flow step, and read which failures to retry and which to record."
sidebar:
  order: 7
---

`Channels.layer` sends one short message to people outside the app: by email
through Resend, or to a Telegram chat through the Bot API. Use it for alerts a
person must see while every device is off, such as spend or budget alerts.

## Configure the providers

Give the layer the providers the deployment has. A channel without one is
refused `unconfigured`, and `available` lists the ones it can send on:

```ts
import { Channels } from "@smthrs/notifications"
import { Config, Effect, Option } from "effect"

export const channels = Effect.gen(function*() {
  const apiKey = yield* Config.option(Config.Redacted("ALERT_EMAIL_API_KEY"))
  const token = yield* Config.option(Config.Redacted("ALERT_TELEGRAM_BOT_TOKEN"))
  return Channels.layer({
    ...(Option.isSome(apiKey) ? { email: { apiKey: apiKey.value, from: "Alerts <alerts@example.com>" } } : {}),
    ...(Option.isSome(token) ? { telegram: { token: token.value } } : {})
  })
})
```

- **Email:** a Resend API key and a sender on a domain Resend verified. Until a
  domain is verified, `onboarding@resend.dev` sends only to the account's own
  address.
- **Telegram:** a bot's token from @BotFather. The bot reaches a person only
  after they started a chat with it, and a group only once it is a member. A
  chat id is a number (`123456789`, or a supergroup's `-1001234567890`) or a
  public channel's `@username`.
- `url` points a provider at another origin, such as a local server in an
  end-to-end test.

## Send from a durable step

Run each send as a flow step, one per message and channel, so the engine
retries it. Give the message an `id` that is the same on every attempt: Resend
sends one email per id within 24 hours.

```ts
import { Channels } from "@smthrs/notifications"
import { Effect } from "effect"

const deliver = (chatId: string, alertId: string) =>
  Effect.gen(function*() {
    const channels = yield* Channels.Channels
    return yield* channels.send(
      { _tag: "telegram", chatId },
      { id: alertId, subject: "Model spend: 12,340 tokens · $0.02", text: "agent 12,000 · judge 340" }
    )
  })
```

A step's failures split in two:

| Failure                                                                   | What to do                                                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DeliveryFailed`: `unreachable`, `timeout`, `unavailable`, `rate_limited` | Fail the step and let the engine retry. A 429's `retryAfterMillis` replaces the policy's backoff for that attempt.      |
| `DeliveryRefused`: `rejected`, `unauthorized`, `unconfigured`             | Record it and end the step: a wrong address, chat or key won't change on retry. Show `code` and `reason` to the person. |

Both carry the channel, the HTTP status and the provider's short error name,
never the request, a credential or the destination, so they are safe to journal
and log.

## What it guarantees

- **Credentials stay put.** The API key is a header and the bot token is in the
  request's path; neither reaches a failure, a span or a log. Redirects are
  never followed.
- **Bounded.** Each send ends within `timeout`, ten seconds by default.
- **At least once on Telegram.** The Bot API has no idempotency key: a process
  that dies after Telegram took the message and before it recorded the receipt
  sends it again.

## Declare the guarantee in the step

A send is a write another service can't undo, so put each one in its own
`irreversible` step and say which guarantee you want:

- **At least once:** declare an `idempotencyKey`, such as the message's id and
  channel. A durable engine runs the step again after a host died mid-send, so
  a Telegram message can arrive twice; an email within Resend's 24 hours can't.
  Choose this when a duplicate beats a lost message, as for alerts.
- **At most once:** declare no `idempotencyKey`. A durable engine never runs an
  unsettled send again; the step stops with
  `IrreversibleRetryRequiresIdempotencyKey`, and the message may or may not
  have gone out.

Never decide whether a message went out by looking for one that reads the same.

## Test it

Point a provider's `url` at a server on loopback for the happy path. For an
unhappy one, provide a faulty `FetchHttpClient.Fetch`, or a whole faulty
`Channels.Channels`:

```ts
import { Channels } from "@smthrs/notifications"
import { Effect, Layer } from "effect"

export const downChannels = Layer.succeed(Channels.Channels)({
  available: ["email"],
  send: () => Effect.fail(new Channels.DeliveryFailed({ channel: "email", code: "unavailable", status: 503 }))
})
```
