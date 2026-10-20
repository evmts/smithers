# The metered model endpoint

Every model call the browser's agent makes goes through one server endpoint, `POST /api/model/<role>` on ChatApi. The endpoint holds the provider key, refuses callers who may not ask Smithers, checks the deployment's budget, picks the role's model and records what each call spent. Decisions: [0011](../decisions/0011-the-agent-runs-in-the-browser.md) §3, [0004](../decisions/0004-agent-ui-codemode-and-rendering.md) question 2, [0008](../decisions/0008-auth.md) §11.

## How it works

```
browser agent (a durable ModelStep) ── ModelProxy.layerClient ── POST /api/model/agent ──▶ ChatApi
  ChatApi: ModelProxy.serve
    prepare:  Sessions.resolve ─ none ──▶ 401 authentication
                                └ Guest, no role ──▶ 403 authentication
              bound the request ─ bad ──▶ 400 invalid_request
              model_usage today ≥ budget ──▶ 429 quota_exceeded
              model_roles[role] ─ row ──▶ HostModel.make(row) ─ unusable ──▶ 503 no_route
                                └ none ─▶ HostModel (CHAT_MODEL)
    model.stream ──▶ provider            (the key stays in the Worker)
    onEnd:    INSERT model_usage by the call's invocation id   (before the terminal line)
  ◀── NDJSON model events, then {"type":"end"} or {"type":"error",code,...}
```

- **The SDK does the HTTP.** `ModelProxy.serve` from `@smthrs/model` reads the request, runs the app's `prepare`, streams the events and observes the call. The browser's agent reads it with `ModelProxy.layerClient`, a `Model` like any other. See [Proxy a model](../../../../packages/smithers/agent/model/docs/guides/proxy-a-model.md).
- **The call is durable in the browser, not here.** A model call is a durable step in the browser's engine; this endpoint serves one attempt of it. A crash mid-call runs that call again on resume, and a sealed result is never fetched again ([0011](../decisions/0011-the-agent-runs-in-the-browser.md) §3).
- **Code:** `worker/ModelEndpoint.ts` (the handler and its policy), `worker/ModelRoles.ts` (role lookup and `set`), `worker/ModelUsage.ts` (the budget's reads and writes), `worker/SetModel.ts` (`admin/SetModel`), `worker/Actor.ts` (who is acting, and `canAsk`, who may ask; sign-in in `worker/SignIn.ts` provides the actor), and the route in `worker/Chat.ts`. The route and role names the browser shares are in `src/features/model/contract.ts`.

## Sign-in

Signed-out people can't ask Smithers ([0008](../decisions/0008-auth.md) §11), and asking is `repo:ask`, Member or above ([0007](../decisions/0007-roles-and-tags.md) §2). A signed-in Guest, or a person with no role on the repository, is refused with `403` and code `authentication`: `ModelError` has no permission code, and a provider's own 403 classifies the same way. Neither refusal calls the model or meters anything. The endpoint reads who is asking through an injected service, `Sessions`, whose `resolve` gives the request's `Actor` or none; [sign-in](sign-in.md) provides it from the session cookie.

- **Production:** sign-in's sessions. Until the GitHub App is configured (`GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`), nobody is signed in, and every call is refused with `401` and code `authentication`.
- **Local development:** under `alchemy dev`, `alchemy.run.ts` declares `worker/DevChatApi.ts` in place of `worker/ChatApi.ts`: the same program, with a local developer signed in as an Admin while the GitHub App isn't configured; the developer can sign out (the dev signed-out cookie), and is then refused `401` like anyone signed out ([sign-in.md](sign-in.md#local-development)). A deploy bundles `worker/ChatApi.ts`, which never imports it.
- **Tests** provide an actor through a layer (`signedIn(actor)` in `worker/test/harness.ts`), or sign-in's own sessions (`worker/test/signIn.ts`).
- Sessions that can't be read (Postgres unreachable) are `503` with code `provider_internal`, not a sign-in prompt.
- An `Actor` is a person (`subject`), their role on the repository (Admin, Maintainer, Member or Guest, or none; [0007](../decisions/0007-roles-and-tags.md) question 1), and `act` when an agent, flow or sandbox acts for them.

## The request

The caller chooses the conversation, its system prompt and its tools; the endpoint bounds the rest.

| Field | What the endpoint does |
|---|---|
| `modelId` | replaced by the role's model |
| `messages` | at least 1, at most `MODEL_MAX_MESSAGES`; otherwise `400` |
| `serverTools` | refused with `400`: provider-run tools spend on the deployment's account |
| `params.maxTokens` | at most `MODEL_MAX_OUTPUT_TOKENS`; that value when unset |
| `params.thinkingBudget` | at most `MODEL_MAX_OUTPUT_TOKENS` |
| everything else | passed through: `system`, `tools`, `toolChoice`, `cacheKey`, `cacheBoundary` and the other `params` |

The body is at most 1 MiB (`ModelProxy.defaultMaxBodyBytes`).

## Roles

Each model call names its role: `agent`, `renderer` or `judge`. A role is answered by the model an admin set for it, read from Postgres on every call, or by the deployment's default model (`CHAT_MODEL`, through `HostModel`) when no admin has. A change applies on the next call, with no deploy.

An admin changes a role with the flow `admin/SetModel { role, model }`. `model` is a configured-model record (`@smthrs/rpc` ConfiguredModel) without its name: `protocol`, `baseUrl`, `path`, `modelId` and `credential`. `credential` names a key the Worker already holds, such as `CEREBRAS_API_KEY`; the key itself never enters the record.

- **Who may run it:** only a person with the Admin role acting in person. An agent, flow or sandbox acting for an Admin is refused (`NotAllowed`, reason `delegated`), and so is anyone else (`not_admin`). The step decides before it writes.
- **What it writes:** the `model_roles` row and a `model_role_changes` row naming who changed it, in one transaction. A replayed step finds its change by its invocation key and records it once.
- **Where it runs:** on any host; the host that starts it provides `CurrentActor`, never the payload. Its tests run it on the Node host. Starting it from the CLI or an admin view comes with sign-in.
- **A row the Worker can't use,** such as one naming a credential the Worker doesn't hold or one that isn't a record, makes that role's calls fail with `503` and code `no_route`. The `model.endpoint` log line names the reason (`unusable:<reason>`).

## Budget

Before each call the endpoint sums today's `model_usage` rows (input and output tokens, since midnight UTC). At or over `MODEL_DAILY_TOKEN_BUDGET` it refuses with `429` and code `quota_exceeded`, and the model isn't called.

After each call that reached a model, `onEnd` writes one `model_usage` row with what the model reported. Its key is the invocation id `ModelProxy.serve` mints for that call; the caller's `x-smithers-request-id` is kept beside it to correlate, never as the key, because a caller may send one id on any number of calls and each one runs the model. The terminal line waits for the write, so a call that starts after another ended sees its spend. Calls in flight at the same time can overshoot the budget by what they spend together. A call cut off by its client records the usage reported before it went away. A write that fails is logged (`model.usage`) and counted, and the answer still ends.

Tokens are also counted in the `smithers_model_tokens` metric, by `role`, `model` and `type`, which the spend alert reads ([observability.md](../observability.md#model-endpoint)).

## Errors

Every refusal is a JSON body `{ code, message, requestId }` with a `ModelError` code. A failure after the stream started is the terminal line `{ "type": "error", code, message }`, whose message is a fixed headline for its code. Neither ever carries provider text.

| Status | `code` | When |
|---|---|---|
| `400` | `invalid_request` | the body isn't a `ModelRequest`, or the request breaks a bound above |
| `401` | `authentication` | nobody is signed in |
| `403` | `authentication` | the caller is a Guest, or has no role on the repository |
| `404` | none (empty) | the role isn't `agent`, `renderer` or `judge` |
| `405` | `invalid_request` | not a `POST` |
| `413` | `invalid_request` | the body is over 1 MiB |
| `429` | `quota_exceeded` | today's budget is spent |
| `503` | `no_route` | the role's setting can't be used here |
| `503` | `provider_internal` | Postgres couldn't be read |

## Postgres

Migration `0004_model_roles`. None of these tables is synced to browsers.

| Table | Columns | |
|---|---|---|
| `model_roles` | `role` (key: `agent`, `renderer`, `judge`), `model` (jsonb record), `updated_by`, `updated_at` | the admin's setting per role |
| `model_role_changes` | `id`, `invocation_key` (unique), `role`, `model`, `changed_by`, `changed_at` | the audit of `admin/SetModel` |
| `model_usage` | `invocation_id` (key, the server's id for the call), `request_id` (the caller's), `role`, `model_id`, `input_tokens`, `output_tokens`, `created_at` (indexed) | what each served call spent |

## Configuration

| Variable | Default | |
|---|---|---|
| `MODEL_DAILY_TOKEN_BUDGET` | `1000000` | a positive integer: the deployment's tokens per UTC day, input and output together |
| `MODEL_MAX_OUTPUT_TOKENS` | `8000` | a positive integer: the most output tokens one call may ask for |
| `MODEL_MAX_MESSAGES` | `200` | a positive integer: the most messages one call may send |
| `CHAT_MODEL` | Cerebras `qwen-3.8-27b` | the default model for every role without a setting; see [chat.md](chat.md#configuration) |
| `ANSWER_TURN_LIVE_SECONDS` | `30` | the `agent` role's liveness bound: how long a live run of the role may go without writing its answer, read beside the roles (`src/features/model/contract.ts`); the evidence for the default is in [agent.md](agent.md#turn-by-turn) |
| a setting's credential | none | the key a `model_roles` record names, for example `CEREBRAS_API_KEY`; a custom credential `NAME` reads `SMITHERS_MODEL_KEY_NAME` and `SMITHERS_MODEL_KEY_NAME_ORIGIN` |

## Tests

`worker/ModelEndpoint.test.ts` runs ChatApi's real handler on its own schema of the compose Postgres (`pnpm db:up`). The model provider is the only scripted seam: the default model is a scripted `Model`, and a model an admin sets is a real `HostModel` reaching a scripted OpenAI-compatible provider on loopback HTTP. `admin/SetModel` runs on the Node host (`worker/test/flowHost.ts`).

- A signed-out call is refused with `401`, and a Guest's or a roleless person's with `403`; neither reaches a model or meters anything. A Member's call streams, and the browser's `ModelProxy.layerClient` reads it as a `Model`.
- The request bounds: model id, output tokens, thinking budget, provider-run tools, message counts.
- A role change by `admin/SetModel` applies on the next call, with the key sent only to the setting's origin; the other roles keep the default.
- An agent acting for an Admin, and a Member, can't run `admin/SetModel`, and nothing is written. A database failure fails its run as a defect (`worker/SetModel.test.ts`).
- Usage rows and `smithers_model_tokens` per role and model; calls that repeat one request id each book a row and count against the budget; `429` once today's spend reaches the budget; yesterday's spend doesn't count; a usage write Postgres refuses is logged and counted.
- Postgres unreachable, and a role lookup Postgres refuses, are `503 provider_internal`; an unusable setting is `503 no_route`.
- No exported log line, span or metric carries the prompt, the answer, the provider's error text or the key (a sentinel test).

The SDK's own suite (`packages/smithers/agent/model/test/ModelProxy.test.ts`) covers the wire format, the client's typed failures, cancellation, request ids, and a fresh invocation id for every served call when callers repeat a request id.
