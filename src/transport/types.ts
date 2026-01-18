export interface UIMessage {
  id: string
}

export type ChatTransportTrigger = 'submit-message' | 'regenerate-message'

export interface ChatTransportSendOptions<UI_MESSAGE extends UIMessage> {
  trigger: ChatTransportTrigger
  chatId: string
  messageId: string | undefined
  messages: UI_MESSAGE[]
  abortSignal: AbortSignal | undefined
  headers?: HeadersInit
  body?: Record<string, any>
  metadata?: unknown
}

export interface ChatTransportReconnectOptions {
  chatId: string
  headers?: HeadersInit
  body?: Record<string, any>
  metadata?: unknown
}

export interface ChatTransport<UI_MESSAGE extends UIMessage, CHUNK> {
  sendMessages(options: ChatTransportSendOptions<UI_MESSAGE>): Promise<ReadableStream<CHUNK>>
  reconnectToStream(options: ChatTransportReconnectOptions): Promise<ReadableStream<CHUNK> | null>
}

export type SmithersMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface SmithersMessage extends UIMessage {
  id: string
  role: SmithersMessageRole
  content: string
  createdAt?: string
  metadata?: Record<string, unknown>
}

export type SmithersTable =
  | 'executions'
  | 'phases'
  | 'agents'
  | 'tool_calls'
  | 'state'
  | 'transitions'
  | 'artifacts'
  | 'reports'
  | 'commits'
  | 'snapshots'
  | 'reviews'
  | 'tasks'
  | 'steps'
  | 'human_interactions'
  | 'render_frames'

export type SmithersChunk =
  | {
      type: 'status'
      status: 'started' | 'completed' | 'failed' | 'stopped'
      chatId: string
      executionId: string
      error?: string
    }
  | {
      type: 'table'
      table: SmithersTable
      rows: Record<string, unknown>[]
      isSnapshot: boolean
    }
  | {
      type: 'message'
      message: SmithersMessage
    }
