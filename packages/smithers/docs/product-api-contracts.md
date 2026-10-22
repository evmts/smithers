# Internal product API contracts

`src/internal/backend/ProductApi.ts` retains the former backend's client
contracts. Its generator and OpenAPI source were removed with that backend;
corrections use the handlers retained at revision `78407fce59dd`.

- `getApiConfirmations` returns the confirmation rows, including `[]`.
- `postWebhooksGithub` accepts the original signed JSON text and the event,
  delivery and signature headers. `Transport.request` honors `rawBody` without
  JSON serialization; the CLI `Client` implements this option. `raw` means signed
  JSON text sent as `application/json`, and takes precedence over a positional body.
- Mutation wrappers forward caller JSON fields unchanged to the transport.
  The CAS upload accepts `Uint8Array` (`binary`) and sends exactly that view as
  `application/octet-stream`, including empty arrays and views with byte offsets.
  JSON bodies retain JSON serialization.
- `putApiInstall` accepts one settings group: capacity/model access, network
  address, or the Obsidian path. At least one setting is required. Runtime
  validation remains the server's responsibility.
- `getApiLive` uses an injected `LiveTransport.connect` with
  `smithers.live.v1` and returns the connector's connection unchanged. The
  connector supplies authentication and owns connection cleanup; callers can
  send subscriptions and receive events on that connection. An HTTP-only
  `Client` does not implement this separate capability.
- `postApiOauth2Token` accepts JSON authorization-code or refresh-token
  exchange parameters.
- `putApiNotificationsPreferences` accepts partial boolean settings, preserving
  `false`, omitted fields and explicit `null`.

`ProductApiContracts.test.ts` exercises real loopback HTTP through `Client`,
a real WebSocket peer, and compiler acceptance/rejection of install settings.
`ProductApiBodies.test.ts` verifies mutation fields, upload bytes and raw-body
precedence through real loopback HTTP. `ProductApi.test.ts` checks all retained
HTTP operations against the corrected operation fixture. These transport wrappers add no diagnostics containing
payloads, tokens, signatures or user settings.

No library was added: the catalog's GitHub client (`@smthrs/integrations`)
targets GitHub's API; these wrappers address the retained Smithers backend.
