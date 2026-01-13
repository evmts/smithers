# TUI Architecture: SolidJS Integration

This document outlines the architecture for Smithers' user interfaces, including the Terminal User Interface (TUI) and the Desktop Application.

## Architecture Overview

Smithers uses **SolidJS** as its core reactive runtime. This choice unifies the agent execution logic (Smithers Core) and the visualization layers (TUI/Desktop).

### The "Universal Renderer" Pattern

Both the Agent Execution and the UI rendering rely on SolidJS's universal renderer capability (or similar patterns):

1.  **Agent Execution**: Solid JSX (`<Claude>`, `<Step>`) renders to an abstract `SmithersNode` tree.
2.  **Desktop UI**: Solid JSX (HTML) renders to DOM via Tauri.
3.  **Terminal UI**: (Planned) Solid JSX renders to Terminal output via a custom renderer.

## Desktop Application (Tauri)

The Smithers Desktop app (`apps/tauri-app`) is a standard Tauri application using SolidJS.

*   **Frontend**: SolidJS + Vite
*   **Backend**: Rust (Tauri) + Node.js (Bridge)
*   **State Sync**: The CLI sends execution events (via `TauriBridge`) to the Desktop app, which updates local Solid signals to reflect the agent's state in real-time.

### State Sharing Pattern

```typescript
// CLI (Node.js)
executePlan(agent, {
  onFrameUpdate: (tree) => {
    tauriBridge.sendTreeUpdate(tree)
  }
})

// Desktop (SolidJS)
const [tree, setTree] = createSignal(initialTree)
listen('tree-update', (e) => setTree(e.payload))
```

## Terminal UI (Research & Design)

*See [TUI Design](./tui-design.md) for the specific UI specification.*

We aim to implement a rich TUI directly in the terminal using a SolidJS-based renderer.

### Why SolidJS for TUI?

*   **Fine-grained Reactivity**: Only update the characters on screen that changed. This is crucial for performance in terminals where re-painting the whole screen causes flickering.
*   **Unified Mental Model**: Use the same signals/effects for Agent Logic and UI Logic.
*   **No VDOM Overhead**: Solid's direct-to-output updates are ideal for the imperative nature of terminal escape codes.

### Comparison with React (OpenTUI/Ink)

Previous research considered React-based solutions (Ink, OpenTUI). We moved to SolidJS to align with the core framework migration.

| Feature | React (Ink/OpenTUI) | SolidJS TUI |
|---------|---------------------|-------------|
| Updates | VDOM Diffing | Fine-grained Signals |
| Overhead | Higher (VDOM) | Lower (Direct) |
| Alignment| React-based | Native to Smithers |

## Future Implementation Plan

1.  **Custom Renderer**: Implement a `solid-js/universal` renderer that targets a terminal buffer.
2.  **Component Library**: Port the design from `tui-design.md` to Solid components (`<Box>`, `<Text>`).
3.  **Integration**: Run the TUI renderer in parallel with the Agent renderer.

## References

*   [SolidJS Universal Renderer](https://www.solidjs.com/docs/latest/api#createrenderer)
*   [Tauri Documentation](https://tauri.app/)