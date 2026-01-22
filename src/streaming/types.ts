import type { LanguageModelV3StreamPart } from "./v3-compat.js";

export type StreamPart = LanguageModelV3StreamPart;

export type SmithersStreamPart =
  | StreamPart
  | {
      type: "cli-output";
      stream: "stdout" | "stderr";
      raw: string;
    }
  | {
      type: "session-info";
      sessionId: string;
      model: string;
    };
