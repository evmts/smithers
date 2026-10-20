/**
 * The terminal frame runtime's entry, bundled with xterm.js into
 * `runtime.generated.ts` by `scripts/build-views.mjs`.
 */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { startTerminalFrame } from "./frame";

startTerminalFrame(window, { Terminal, FitAddon });
