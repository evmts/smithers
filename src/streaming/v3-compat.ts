export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface Warning {
  type: string;
  message: string;
}

export type FinishReason =
  | { unified: "stop" | "length" | "tool-calls" | "content-filter" | "error" | "unknown" }
  | { provider: string; reason: string };

export interface TokenUsage {
  inputTokens: {
    total: number;
    cacheCreation?: number;
    cacheRead?: number;
  };
  outputTokens: {
    total: number;
  };
}

export interface ResponseMetadata {
  requestId?: string;
  responseId?: string;
  model?: string;
  providerMetadata?: Record<string, JSONValue>;
}

export type LanguageModelV3StreamPart =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-start"; id: string; toolName: string }
  | { type: "tool-input-delta"; id: string; delta: string }
  | { type: "tool-input-end"; id: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: string }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: JSONValue }
  | { type: "stream-start"; warnings: Warning[] }
  | { type: "response-metadata"; metadata: ResponseMetadata }
  | { type: "finish"; usage: TokenUsage; finishReason: FinishReason }
  | { type: "file"; mediaType: string; data: string | Uint8Array }
  | {
      type: "source";
      sourceType: "url" | "document";
      id?: string;
      title?: string;
      url?: string;
      content?: string;
    }
  | { type: "error"; error: unknown };
