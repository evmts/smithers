import type { SmithersStreamPart } from "./types.js";

export abstract class BaseStreamParser {
  protected buffer = "";

  parse(chunk: string): SmithersStreamPart[] {
    this.buffer += chunk;
    const parts: SmithersStreamPart[] = [];

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = this.parseJsonLine(trimmed);
      if (parsed) {
        parts.push(...parsed);
      } else {
        parts.push(...this.handleNonJsonLine(line));
      }
    }

    return parts;
  }

  flush(): SmithersStreamPart[] {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return [];
    }
    const parts = this.parseJsonLine(this.buffer) ?? this.handleNonJsonLine(this.buffer);
    this.buffer = "";
    return parts;
  }

  protected parseJsonLine(line: string): SmithersStreamPart[] | null {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      return this.mapEvent(event);
    } catch {
      return null;
    }
  }

  protected abstract mapEvent(event: Record<string, unknown>): SmithersStreamPart[];
  protected abstract handleNonJsonLine(line: string): SmithersStreamPart[];
}
