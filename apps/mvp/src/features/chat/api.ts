import { Effect, Stream } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

export type ChatTurn = { role: "user" | "assistant"; content: string }

// The header that ties one answer's browser logs, Worker logs and model span together.
export const ANSWER_ID_HEADER = "x-smithers-answer-id"

// Smithers' answer to the conversation, as text chunks streamed from the Worker's POST /api/chat.
export const streamAnswer = (chatUrl: string, answerId: string, history: ReadonlyArray<ChatTurn>) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
      const response = yield* client.execute(
        HttpClientRequest.post(chatUrl).pipe(
          HttpClientRequest.setHeader(ANSWER_ID_HEADER, answerId),
          HttpClientRequest.bodyJsonUnsafe({ messages: history }),
        ),
      )
      return response.stream.pipe(Stream.decodeText)
    }),
  )
