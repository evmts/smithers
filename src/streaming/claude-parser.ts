// Claude CLI stream parser -> Smithers stream parts.

import { randomUUID } from "node:crypto";
import type { SmithersStreamPart } from "./types.js";
import type { JSONValue } from "./v3-compat.js";

type BlockType = "text" | "reasoning" | "tool";

interface ClaudeContentBlock {
  id?: string;
  type: "text" | "thinking" | "reasoning" | "tool_use";
  name?: string;
}

interface ClaudeDelta {
  text?: string;
  thinking?: string;
  reasoning?: string;
  input?: unknown;
}

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface ClaudeMessage {
  id?: string;
  model?: string;
}

export class ClaudeStreamParser {
  private buffer = "";
  private currentBlockId: string | null = null;
  private currentBlockType: BlockType | null = null;

  parse(chunk: string): SmithersStreamPart[] {
    this.buffer += chunk;
    const parts: SmithersStreamPart[] = [];

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = this.parseJsonLine(trimmed);
      if (parsed) {
        parts.push(...parsed);
      } else {
        parts.push(...this.emitTextFallback(line));
      }
    }

    return parts;
  }

  flush(): SmithersStreamPart[] {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return [];
    }
    const parts = this.emitTextFallback(this.buffer);
    this.buffer = "";
    return parts;
  }

  private parseJsonLine(line: string): SmithersStreamPart[] | null {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      return this.mapEvent(event);
    } catch {
      return null;
    }
  }

  private emitTextFallback(content: string): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = [];

    if (this.currentBlockType !== "text") {
      if (this.currentBlockId && this.currentBlockType) {
        const id = this.currentBlockId;
        if (this.currentBlockType === "reasoning") {
          parts.push({ type: "reasoning-end", id });
        } else if (this.currentBlockType === "tool") {
          parts.push({ type: "tool-input-end", id });
        } else {
          parts.push({ type: "text-end", id });
        }
      }
      this.currentBlockId = randomUUID();
      this.currentBlockType = "text";
      parts.push({ type: "text-start", id: this.currentBlockId });
    }

    parts.push({ type: "text-delta", id: this.currentBlockId!, delta: content });
    return parts;
  }

  private mapEvent(event: Record<string, unknown>): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = [];
    const eventType = event["type"];

    switch (eventType) {
      case "stream_start":
      case "message_start": {
        const warnings = Array.isArray(event["warnings"]) ? event["warnings"] : [];
        parts.push({ type: "stream-start", warnings });
        const message = event["message"] as ClaudeMessage | undefined;
        if (message?.model) {
          const metadata: { model: string; requestId?: string } = { model: message.model };
          if (message.id) {
            metadata.requestId = message.id;
          }
          parts.push({ type: "response-metadata", metadata });
        }
        return parts;
      }
      case "response_metadata": {
        const metadata = (event["metadata"] ?? {}) as Record<string, unknown>;
        parts.push({ type: "response-metadata", metadata });
        return parts;
      }
      case "message_stop": {
        const usage = event["usage"] as ClaudeUsage | undefined;
        if (usage) {
          const stopReason = (event["stop_reason"] as string) ?? "stop";
          parts.push({
            type: "finish",
            usage: {
              inputTokens: { total: usage.input_tokens ?? 0 },
              outputTokens: { total: usage.output_tokens ?? 0 },
            },
            finishReason: { unified: stopReason as "stop" | "length" | "tool-calls" | "content-filter" | "error" | "unknown" },
          });
        }
        return parts;
      }
      case "content_block_start": {
        const block = (event["content_block"] ?? {}) as ClaudeContentBlock;
        const id = block.id ?? randomUUID();
        this.currentBlockId = id;

        if (block.type === "text") {
          this.currentBlockType = "text";
          parts.push({ type: "text-start", id });
          return parts;
        }
        if (block.type === "thinking" || block.type === "reasoning") {
          this.currentBlockType = "reasoning";
          parts.push({ type: "reasoning-start", id });
          return parts;
        }
        if (block.type === "tool_use") {
          this.currentBlockType = "tool";
          parts.push({ type: "tool-input-start", id, toolName: block.name ?? "unknown" });
          return parts;
        }
        return parts;
      }
      case "content_block_delta": {
        const delta = (event["delta"] ?? {}) as ClaudeDelta;
        const id = (event["indexed_content_block_id"] as string) ?? this.currentBlockId ?? randomUUID();
        if (delta.text !== undefined) {
          parts.push({ type: "text-delta", id, delta: String(delta.text) });
          return parts;
        }
        if (delta.thinking !== undefined || delta.reasoning !== undefined) {
          const content = delta.thinking ?? delta.reasoning ?? "";
          parts.push({ type: "reasoning-delta", id, delta: String(content) });
          return parts;
        }
        if (delta.input !== undefined) {
          parts.push({ type: "tool-input-delta", id, delta: JSON.stringify(delta.input) });
          return parts;
        }
        return parts;
      }
      case "content_block_stop": {
        const id = (event["indexed_content_block_id"] as string) ?? this.currentBlockId ?? randomUUID();
        if (this.currentBlockType === "text") {
          parts.push({ type: "text-end", id });
        } else if (this.currentBlockType === "reasoning") {
          parts.push({ type: "reasoning-end", id });
        } else if (this.currentBlockType === "tool") {
          parts.push({ type: "tool-input-end", id });
        }
        this.currentBlockId = null;
        this.currentBlockType = null;
        return parts;
      }
      case "tool_use": {
        const id = (event["id"] as string) ?? randomUUID();
        const toolName = (event["name"] as string) ?? "unknown";
        parts.push({ type: "tool-input-start", id, toolName });
        if (event["input"] !== undefined) {
          parts.push({ type: "tool-input-delta", id, delta: JSON.stringify(event["input"]) });
        }
        parts.push({ type: "tool-input-end", id });
        parts.push({
          type: "tool-call",
          toolCallId: id,
          toolName,
          input: JSON.stringify(event["input"] ?? {}),
        });
        return parts;
      }
      case "tool_result": {
        const toolCallId = (event["tool_use_id"] as string) ?? (event["toolCallId"] as string) ?? randomUUID();
        const toolName = (event["name"] as string) ?? "unknown";
        const result = event["content"] ?? event["result"] ?? event["output"] ?? null;
        parts.push({
          type: "tool-result",
          toolCallId,
          toolName,
          result: result as JSONValue,
        });
        return parts;
      }
      case "error":
        parts.push({ type: "error", error: event["error"] ?? event });
        return parts;
      default:
        return [{ type: "cli-output", stream: "stdout", raw: JSON.stringify(event) }];
    }
  }
}
