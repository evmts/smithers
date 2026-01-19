// Claude CLI stream parser -> Smithers stream parts.

import { randomUUID } from "node:crypto";
import type { SmithersStreamPart } from "./types.js";

type BlockType = "text" | "reasoning" | "tool";

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
      const event = JSON.parse(line);
      return this.mapEvent(event);
    } catch {
      return null;
    }
  }

  private emitTextFallback(content: string): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = [];

    if (this.currentBlockType !== "text") {
      if (this.currentBlockId && this.currentBlockType) {
        parts.push({ type: `${this.currentBlockType}-end`, id: this.currentBlockId } as SmithersStreamPart);
      }
      this.currentBlockId = randomUUID();
      this.currentBlockType = "text";
      parts.push({ type: "text-start", id: this.currentBlockId });
    }

    parts.push({ type: "text-delta", id: this.currentBlockId!, delta: content });
    return parts;
  }

  private mapEvent(event: any): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = [];

    switch (event.type) {
      case "stream_start":
      case "message_start":
        parts.push({ type: "stream-start", warnings: event.warnings ?? [] });
        if (event.message?.model) {
          parts.push({
            type: "response-metadata",
            metadata: {
              model: event.message.model,
              requestId: event.message.id,
            },
          });
        }
        return parts;
      case "response_metadata":
        parts.push({ type: "response-metadata", metadata: event.metadata ?? {} });
        return parts;
      case "message_stop":
        if (event.usage) {
          parts.push({
            type: "finish",
            usage: {
              inputTokens: { total: event.usage.input_tokens ?? 0 },
              outputTokens: { total: event.usage.output_tokens ?? 0 },
            },
            finishReason: { unified: event.stop_reason ?? "stop" },
          });
        }
        return parts;
      default:
        break;
    }

    if (event.type === "content_block_start") {
      const block = event.content_block ?? {};
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
    }

    if (event.type === "content_block_delta") {
      const delta = event.delta ?? {};
      const id = event.indexed_content_block_id ?? this.currentBlockId ?? randomUUID();
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
    }

    if (event.type === "content_block_stop") {
      const id = event.indexed_content_block_id ?? this.currentBlockId ?? randomUUID();
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

    if (event.type === "tool_use") {
      const id = event.id ?? randomUUID();
      parts.push({ type: "tool-input-start", id, toolName: event.name ?? "unknown" });
      if (event.input !== undefined) {
        parts.push({ type: "tool-input-delta", id, delta: JSON.stringify(event.input) });
      }
      parts.push({ type: "tool-input-end", id });
      parts.push({
        type: "tool-call",
        toolCallId: id,
        toolName: event.name ?? "unknown",
        input: JSON.stringify(event.input ?? {}),
      });
      return parts;
    }

    if (event.type === "tool_result") {
      parts.push({
        type: "tool-result",
        toolCallId: event.tool_use_id ?? event.toolCallId ?? randomUUID(),
        toolName: event.name ?? "unknown",
        result: event.content ?? event.result ?? event.output ?? null,
      });
      return parts;
    }

    if (event.type === "error") {
      parts.push({ type: "error", error: event.error ?? event });
      return parts;
    }

    return [{ type: "cli-output", stream: "stdout", raw: JSON.stringify(event) }];
  }
}
