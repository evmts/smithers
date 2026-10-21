/**
 * `@smthrs/terminal-frame`
 *
 * A shell's terminal: xterm.js runs in an opaque-origin frame whose CSP pins
 * the generated runtime by hash and allows no network, while the page holds
 * the connection. It lives apart from `@smthrs/ui` so a page without a
 * terminal never carries the runtime (about 350 KB of text).
 */
export {
  TerminalFrame,
  type TerminalFrameHandle,
  type TerminalFrameProps,
  type TerminalFrameStream,
  type TerminalFrameWriter,
} from "./TerminalFrame";
export type { TerminalFrameKey, TerminalFrameTheme } from "./protocol";
export { terminalFrameRuntime } from "./runtime.generated";
