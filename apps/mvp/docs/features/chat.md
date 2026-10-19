# Chat with Smithers

## What the user does

1. Opens the app (`/app`) and presses ⌘K (Ctrl+K), or clicks Chat ⌘K.
2. Types a message and presses Enter or Send.
3. Hides the chat with ⌘K again, Esc, or the Hide button.
4. Sees their message, then Smithers' answer growing as it streams.
5. Sees the same conversation, live, in every other browser that has the app open.

If Smithers can't answer, the answer says "Smithers couldn't answer. Try again."

## How it works

```
browser A ── LiveStore (SQLite in the browser) ──┐
                                                  ├── WebSocket /sync ── Durable Object (event log)
browser B ── LiveStore (SQLite in the browser) ──┘
browser A ── POST /api/chat ── Worker ── @smthrs/model ── the configured model (default: Cerebras qwen-3.8-27b, low)
```

- **Local first** (`src/features/chat/schema.ts`): the conversation is a LiveStore event log. Events (`v1.MessageSent`, `v1.AnswerStarted`, `v1.AnswerProgressed`, `v1.AnswerCompleted`, `v1.AnswerFailed`) update a `messages` SQLite table in each browser. Reads and writes are local and instant, and persist across reloads.
- **Sync** (`worker/index.ts`): LiveStore's Cloudflare sync backend. One Durable Object per store keeps the event log and pushes new events to every connected browser. All browsers share one store, `smithers-chat`, for now.
- **Answering**:
  - The browser that sent the message calls `POST /api/chat` (`src/features/chat/actions.ts`, an Effect program) and commits the answer so far about every 150 ms, so other browsers watch it grow.
  - The Worker (`worker/chat.ts`) plans the configured model with `@smthrs/rpc` (`ConfiguredModel.planModelBinding`), opens it with `@smthrs/model-host` (`toModel`), and streams the answer with `@smthrs/model` (`Model.stream`). Smithers' name line comes from `@smthrs/rpc` (`AgentInstructions`).
  - The key never reaches a browser, and Smithers only sends it to the origin the credential is pinned to. The Worker accepts at most 40 messages of 8,000 characters each.
- **Composer** (`tables.composer`): open or hidden, and the draft, is a LiveStore client document. It belongs to one tab and doesn't sync.
- **UI** (`src/features/chat/components/`): `Conversation` and `Composer`, built from `@smthrs/ui`.

## Configuration

The chat model is a Smithers configured-model record, the same one every Smithers host uses (`@smthrs/rpc` `ConfiguredModel`). `alchemy.run.ts` reads it from the environment.

| Variable | Default | |
|---|---|---|
| `CHAT_MODEL` | `{"protocol":"openai-chat","baseUrl":"https://api.cerebras.ai","modelId":"qwen-3.8-27b","credential":"CEREBRAS_API_KEY"}` | Any protocol Smithers supports: `openai-chat` (any OpenAI-compatible API), `openai-responses`, `anthropic-messages`. |
| `CHAT_REASONING_EFFORT` | `low` | `none` … `max`. |
| the record's `credential` | none | Required. A built-in name (`CEREBRAS_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) or, for your own endpoint, `SMITHERS_MODEL_KEY_<NAME>` with `SMITHERS_MODEL_KEY_<NAME>_ORIGIN`. |

The default model, chosen by Will on 2026-10-19: on our Cerebras key, `qwen-3.8-27b` at `low` answered a short question in 0.4 s, against 0.2 s for `gpt-oss-120b` at `low`. Artificial Analysis's Intelligence Index puts it at 43, against 24 for `gpt-oss-120b` at `high`. It costs about twice as much per token.

## Run it

- **Local:** `pnpm dev` runs `alchemy dev`, which serves the app and the Worker in local workerd at http://localhost:1337. Alchemy keeps its state in `.alchemy/`, so no Cloudflare account is needed. Put the record's credential (by default `CEREBRAS_API_KEY`) in your environment first.
- **Deploy:** `pnpm deploy`, with `CLOUDFLARE_API_TOKEN` and `ALCHEMY_PASSWORD` set.

## Not yet

- **No sign-in:** anyone who can reach a deployment can read and write the shared store and spend the model key. Production needs sign-in, and a store per user or team, before it's public.
- **Abandoned answers:** if the sending browser closes mid-answer, the answer stays "streaming" for everyone.

## Tests

The tests use real browsers, the real Worker, Durable Object and model, with no mocks. Locally, `pnpm e2e` starts `alchemy dev`. Against a deployment, run `BASE_URL=https://<host> pnpm e2e`. Each test records video, the source of the feature's GIFs.

- `e2e/chat.spec.ts`: ⌘K, Esc and Hide open and hide the composer, and a real answer arrives.
- `e2e/sync.spec.ts`: two isolated browsers; a message and its answer sent in one appear in the other.
