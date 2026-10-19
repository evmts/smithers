# Chat with Smithers

## What the user does

1. Opens the app (`/app`) and presses ⌘K (Ctrl+K), or clicks Chat ⌘K.
2. Types a message and presses Enter or Send.
3. Hides the chat with ⌘K again, Esc, or the Hide button.
4. Sees their message, then Smithers' answer streaming in below it.
5. Can keep talking; Smithers sees the whole conversation.

If Smithers can't answer, the answer bubble says "Smithers couldn't answer. Try again."

## How it works

```
browser ──POST /api/chat {messages}──▶ Cloudflare Worker ──▶ Cerebras (qwen-3.8-27b, low)
        ◀────────── plain-text stream ◀── (SSE → text) ◀──
```

- **Worker** (`worker/index.ts`): serves the app and `POST /api/chat`. It adds Smithers' instructions, calls Cerebras with the server's `CEREBRAS_API_KEY`, and streams back plain text. The key never reaches the browser. It accepts at most 40 messages of 8,000 characters each.
- **Feature folder** (`src/features/chat/`):
  - `collections.ts`: the messages and the composer (open or hidden, and its draft) are TanStack DB collections, in memory for now.
  - `actions.ts`: every write. `sendMessage` inserts the user's message and an assistant message, then appends streamed text to the answer.
  - `queries.ts`: every read, as live queries.
  - `api.ts`: the `POST /api/chat` stream.
  - `shortcuts.ts`: one window-level key listener toggles the composer on ⌘K and hides it on Esc, wherever focus is, as the old app did.
  - `components/`: `Conversation` and `Composer`, built from `@smthrs/ui` (`ChatTranscript`, `ChatMessage`, `MessageResponse`, `ChatComposer`, `Button`).
- **Screen** (`src/screens/app/AppShell.tsx`): lays out the conversation and the composer.

## Model

`qwen-3.8-27b` with `reasoning_effort: "low"` (Will, 2026-10-19). On our Cerebras key it answered a short question in 0.4 s, against 0.2 s for `gpt-oss-120b` at low. Artificial Analysis's Intelligence Index puts it at 43, against 24 for `gpt-oss-120b` at high. It costs about twice as much per token.

## Local development

`pnpm dev` serves the app; `pnpm dev:worker` runs the Worker on port 8790 with only `CEREBRAS_API_KEY` from your shell. On a network with broken IPv6 the local Worker's model call hangs for minutes; turn IPv6 off (`networksetup -setv6off Wi-Fi`).

## Not yet

- Messages are lost on reload.
- No sign-in, so the production endpoint is open to anyone. Production needs sign-in or a rate limit before it's public.

## Test

`e2e/chat.spec.ts` sends a real message to the real Worker and model, with no mocks, and expects Smithers' answer. Run locally with `pnpm e2e`, or against production with `BASE_URL=https://<host> pnpm e2e`. The recorded video becomes the feature's GIF.
