import { randomUUID } from "node:crypto";
import { BaseStreamParser } from "./base-parser.js";
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

export class ClaudeStreamParser extends BaseStreamParser {
  private currentBlockId: string | null = null;
  private currentBlockType: BlockType | null = null;

  protected handleNonJsonLine(content: string): SmithersStreamPart[] {
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

  private handleStreamStart(event: Record<string, unknown>): SmithersStreamPart[] {
    const parts: SmithersStreamPart[] = [];
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

  private handleResponseMetadata(event: Record<string, unknown>): SmithersStreamPart[] {
    const metadata = (event["metadata"] ?? {}) as Record<string, unknown>;
    return [{ type: "response-metadata", metadata }];
  }

  private handleMessageStop(event: Record<string, unknown>): SmithersStreamPart[] {
    const usage = event["usage"] as ClaudeUsage | undefined;
    if (!usage) return [];
    const stopReason = (event["stop_reason"] as string) ?? "stop";
    return [{
      type: "finish",
      usage: {
        inputTokens: { total: usage.input_tokens ?? 0 },
        outputTokens: { total: usage.output_tokens ?? 0 },
      },
      finishReason: { unified: stopReason as "stop" | "length" | "tool-calls" | "content-filter" | "error" | "unknown" },
    }];
  }

  private handleContentBlockStart(event: Record<string, unknown>): SmithersStreamPart[] {
    const block = (event["content_block"] ?? {}) as ClaudeContentBlock;
    const id = block.id ?? randomUUID();
    this.currentBlockId = id;

    const blockHandlers: Record<string, () => SmithersStreamPart[]> = {
      text: () => {
        this.currentBlockType = "text";
        return [{ type: "text-start", id }];
      },
      thinking: () => {
        this.currentBlockType = "reasoning";
        return [{ type: "reasoning-start", id }];
      },
      reasoning: () => {
        this.currentBlockType = "reasoning";
        return [{ type: "reasoning-start", id }];
      },
      tool_use: () => {
        this.currentBlockType = "tool";
        return [{ type: "tool-input-start", id, toolName: block.name ?? "unknown" }];
      },
    };

    return blockHandlers[block.type]?.() ?? [];
  }

  private handleContentBlockDelta(event: Record<string, unknown>): SmithersStreamPart[] {
    const delta = (event["delta"] ?? {}) as ClaudeDelta;
    const id = (event["indexed_content_block_id"] as string) ?? this.currentBlockId ?? randomUUID();

    if (delta.text !== undefined) {
      return [{ type: "text-delta", id, delta: String(delta.text) }];
    }
    if (delta.thinking !== undefined || delta.reasoning !== undefined) {
      const content = delta.thinking ?? delta.reasoning ?? "";
      return [{ type: "reasoning-delta", id, delta: String(content) }];
    }
    if (delta.input !== undefined) {
      return [{ type: "tool-input-delta", id, delta: JSON.stringify(delta.input) }];
    }
    return [];
  }

  private handleContentBlockStop(event: Record<string, unknown>): SmithersStreamPart[] {
    const id = (event["indexed_content_block_id"] as string) ?? this.currentBlockId ?? randomUUID();
    const endTypes: Record<BlockType, SmithersStreamPart> = {
      text: { type: "text-end", id },
      reasoning: { type: "reasoning-end", id },
      tool: { type: "tool-input-end", id },
    };
    const part = this.currentBlockType ? endTypes[this.currentBlockType] : null;
    this.currentBlockId = null;
    this.currentBlockType = null;
    return part ? [part] : [];
  }

  private handleToolUse(event: Record<string, unknown>): SmithersStreamPart[] {
    const id = (event["id"] as string) ?? randomUUID();
    const toolName = (event["name"] as string) ?? "unknown";
    const parts: SmithersStreamPart[] = [{ type: "tool-input-start", id, toolName }];
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

  private handleToolResult(event: Record<string, unknown>): SmithersStreamPart[] {
    const toolCallId = (event["tool_use_id"] as string) ?? (event["toolCallId"] as string) ?? randomUUID();
    const toolName = (event["name"] as string) ?? "unknown";
    const result = event["content"] ?? event["result"] ?? event["output"] ?? null;
    return [{
      type: "tool-result",
      toolCallId,
      toolName,
      result: result as JSONValue,
    }];
  }

  private handleError(event: Record<string, unknown>): SmithersStreamPart[] {
    return [{ type: "error", error: event["error"] ?? event }];
  }

  private readonly eventHandlers: Record<string, (event: Record<string, unknown>) => SmithersStreamPart[]> = {
    stream_start: (e) => this.handleStreamStart(e),
    message_start: (e) => this.handleStreamStart(e),
    response_metadata: (e) => this.handleResponseMetadata(e),
    message_stop: (e) => this.handleMessageStop(e),
    content_block_start: (e) => this.handleContentBlockStart(e),
    content_block_delta: (e) => this.handleContentBlockDelta(e),
    content_block_stop: (e) => this.handleContentBlockStop(e),
    tool_use: (e) => this.handleToolUse(e),
    tool_result: (e) => this.handleToolResult(e),
    error: (e) => this.handleError(e),
  };

  protected mapEvent(event: Record<string, unknown>): SmithersStreamPart[] {
    const eventType = event["type"] as string;
    const handler = this.eventHandlers[eventType];
    return handler ? handler(event) : [{ type: "cli-output", stream: "stdout", raw: JSON.stringify(event) }];
  }
}
