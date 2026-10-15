# @smthrs/model-host

Provider-neutral model streaming and the durable callback producer shared by the local Smithers and Plue host composition.

The package is private: it ships inside the Smithers host executables, not on npm.

## What it does

A model host is a trusted process that holds the owner's provider credential. The backend sends it a signed turn grant; the host calls the provider, removes any echo of the credential from the output, and commits each frame back to the backend's durable chat journal.

| Endpoint                                 | Constant                         | Purpose                                                                 |
| ---------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `GET /health`                            | `MODEL_HOST_HEALTH_PATH`         | Returns `{ "protocol": "smithers.chat-model-host/v1" }`. No bearer.     |
| `POST /v1/chat/turn`                     | `MODEL_HOST_TURN_PATH`           | Runs one durable chat turn from a grant; answers `204` when committed.  |
| `POST /v1/model/stream`                  | `MODEL_HOST_STREAM_PATH`         | Runs one model call and answers the frames as NDJSON (16 MiB at most).  |
| `POST /v1/context/select`                | `MODEL_HOST_CONTEXT_SELECT_PATH` | Runs the context preflight selector over caller-supplied candidates.    |

Every `POST` route requires `Authorization: Bearer <authorization>` and reads at most 2 MiB of JSON body.

## Building a host

```ts
import { createModelTurnHandler, environmentModelResolver } from "@smthrs/model-host"

// The owner's configured model binding, as the backend stores it.
declare const configuredBinding: unknown

const handler = createModelTurnHandler({
  authorization: process.env["MODEL_HOST_TOKEN"] ?? "",
  callbackBaseUrl: "http://127.0.0.1:4000",
  resolve: environmentModelResolver({ binding: configuredBinding, env: process.env })
})

Bun.serve({ fetch: handler })
```

- `createModelTurnHandler` throws when `authorization` is empty or whitespace, or when `callbackBaseUrl` is not an HTTP or HTTPS URL without user information, query or fragment.
- A turn grant is refused with `400 request_invalid` when it is expired, malformed, names a different run or leg in its cursor, or names a producer origin other than `callbackBaseUrl`.
- `environmentModelResolver` plans the configured binding, reads exactly one named credential from `env`, and refuses provider redirects. A request may pick another model only on the same credential and origin.

## Building blocks

- `runModelTurn` streams one model call into turn frames and cuts the credential out of text, reasoning and tool calls, including echoes split across chunks (`StreamingCredentialCutter`).
- `DurableChatProducer` and `runDurableChatTurn` commit frames to the journal callback and verify each receipt against the expected cursor.
- `fastModelFallback` tries the next source only when one fails as unavailable before it emitted any output.
- `createHostDiagnostics` writes bounded, marker-tagged records to standard error. Fields that are not counts, flags or short tokens are dropped and counted.
- `createModelProbe` tests a configured model and dials only its planned origin.

## Failures

Turn failures are tagged errors (`ResolveFailed`, `ProducerUnreachable`, `ProviderStartRefused`, `CommitRefused`, `ReceiptMismatch`, `StreamTooLarge`) with fixed messages and status codes only. The HTTP answer carries one of `turn_failed`, `provider_quota`, `provider_auth` or `cancelled`, never provider text.

See [docs/host-tools.md](docs/host-tools.md) for the host-owned tools and install origin rules.
