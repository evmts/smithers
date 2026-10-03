# @smthrs/errors

Release candidate scope, host requirements and compatibility review are defined in the [library support policy](https://github.com/smithersai/smithers/blob/main/RELEASE_SUPPORT.md).

**Documentation:** [Package docs](./docs/README.md)

`SmithersError` and its closed code vocabulary for integration failures.

This repository contains version `1.0.0-rc.1`.
[Installation](./docs/installation.md) lists its requirements and imports.

## What it is for

Available now

An integration talks to somebody else's API, so its failures have to remain
readable to a human, classifiable by a caller, and safe to write into a log.
`SmithersError` provides stable error fields and stores caller-supplied context
verbatim. It does not redact values. Integration constructors must remove
credentials before constructing it.

- `code` classifies the failure. See the code list below.
- `summary` is the message without the appended documentation URL.
- `details` carries caller-supplied context. The top-level record is copied and
  frozen at construction, so adding, removing, or replacing a top-level key on
  the caller's object afterwards cannot change it. Nested values are shared by
  reference and are not deep-frozen, so a caller must not mutate a nested
  record it has attached. Integration constructors must remove credentials
  before attaching the record.
- `cause` is stored verbatim and is not redacted. Callers must redact provider
  text, including bot tokens in URLs and API keys in messages, before attaching
  it.
- `docsUrl` points at the reference page for the code.

```ts
import { isSmithersError, SmithersError } from "@smthrs/errors"

const error = new SmithersError("INVALID_INPUT", "no bot token configured")
error.code // "INVALID_INPUT"
error.message // "no bot token configured See https://github.com/smithersai/smithers/blob/main/packages/errors/docs/reference/error-codes.md"
isSmithersError(error) // true
```

## Codes

Available now

`SmithersErrorCode` is derived from the keys of the exported runtime table
`smithersErrorDefinitions`, so the set is closed and an exhaustive `switch`
over `error.code` stays exhaustive.

| Code | Current raise sites | `details` |
| --- | --- | --- |
| `INVALID_INPUT` | `Core.SignalName.eventName` rejects an empty service or event segment, or one containing a colon. | `{ service: value }` or `{ event: value }` |
| `INTEGRATION_ERROR` | `Core.IntegrationError` classifies client, webhook and listener failures. | `{ reason, ...providerSafeDetails }`; `retryable` carries retry classification when supplied |
| `TELEGRAM_API_ERROR` | No current adapter raises it; retained for historical decoding. | Historical provider context |
| `TELEGRAM_INIT_DATA_INVALID` | No current adapter raises it; retained for historical decoding. | Historical authentication context |
| `UNSUPPORTED` | No current integration raise site. | None from current integrations |

[Error code reference](./docs/reference/error-codes.md) explains the current
raise sites, retained codes and caller actions.

## Documentation

Available now

[Package docs](./docs/README.md) cover the error shape, redaction contract,
handling and raising a failure, module copies, and the API.
[Add an error code](./docs/guides/add-an-error-code.md) describes extending the vocabulary.
