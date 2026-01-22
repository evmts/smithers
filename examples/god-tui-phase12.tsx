#!/usr/bin/env bun
/**
 * God-TUI Phase 12: Integration Orchestration
 * 
 * Wires together all components into a production AI coding agent.
 */
import { createSmithersRoot, SmithersProvider, Ralph, Claude, Phase, Step } from "smithers-orchestrator";
import { createSmithersDB } from "smithers-orchestrator/db";

const db = await createSmithersDB({ path: ".smithers/db" });
const executionId = await db.execution.start("God-TUI Phase 12 Integration", "god-tui-phase12.tsx");

const CONTEXT = `
# God-TUI Phase 12 Integration

## Project Structure
- src/god-tui/ - Main project directory
- src/god-tui/main.zig - CLI entry point (currently stubs modes)
- src/god-tui/agent/agent.zig - Agent struct with tool execution
- src/god-tui/modes/interactive.zig - TUI mode (stub)
- src/god-tui/modes/print.zig - Single-shot mode (stub)
- src/god-tui/terminal/terminal.zig - Terminal abstraction layer
- src/god-tui/rendering/renderer.zig - Differential rendering
- src/god-tui/ui/{header,chat,status}.zig - UI components
- src/god-tui/agent/tools/registry.zig - 7 built-in tools

## External Dependencies (in build.zig.zon)
- zig-clap (CLI parsing) - already integrated
- ai-zig (LLM providers) - needs wiring to Agent

## Spec Reference
- issues/god-tui/13-application-layer.md - Full app layer spec

## Goals
1. Wire main.zig to actually instantiate and run modes
2. Connect Agent to ai-zig for real LLM calls
3. Connect InteractiveMode to Terminal + Renderer + UI
4. Create integration tests (mock providers)
5. Update STATUS.md

## Build/Test
cd src/god-tui
zig build
zig build run -- --help
zig test agent/agent.zig
`;

function Phase12Integration() {
  return (
    <SmithersProvider db={db} executionId={executionId} globalTimeout={3600000}>
      <Ralph maxIterations={6}>
        
        <Phase name="PrintMode-Integration">
          <Claude model="sonnet">
{CONTEXT}

## Task: Integrate PrintMode with Agent

Wire print.zig to actually:
1. Create Agent from config
2. Call agent.prompt() with joined positional args  
3. Print streaming output to stdout
4. Handle tool calls (display them)

Steps:
1. Read modes/print.zig, agent/agent.zig, agent/types.zig
2. Import agent module into print.zig
3. Modify PrintMode to accept Agent pointer or config
4. In run(), call agent with prompt and stream response
5. For now use stub responses (ai-zig integration in next phase)
6. Add test that verifies print mode calls agent

Run tests: cd src/god-tui && zig test modes/print.zig

Commit changes with descriptive message.
          </Claude>
        </Phase>

        <Phase name="Agent-AIZig-Integration">
          <Claude model="sonnet">
{CONTEXT}

## Task: Connect Agent to ai-zig for real LLM calls

Wire agent.zig to use the ai-zig anthropic module:
1. Read reference/ai-zig-sdk/ or grep for examples of ai-zig usage patterns
2. Add import for anthropic module to agent.zig
3. Create a Provider abstraction in agent/provider.zig that wraps ai-zig
4. Implement the agent loop to:
   - Build message context from self.messages
   - Call provider.stream() with tools
   - Parse streaming response for text/tool_call events
   - Execute tool calls via tool_registry
   - Emit AgentEvents for UI updates
5. Add mock provider for testing

Since ai-zig may have specific API patterns, first:
- Read the ai-zig reference code to understand its API
- Check build.zig for available modules (ai, anthropic, provider)

Test: zig test agent/agent.zig
Commit changes.
          </Claude>
        </Phase>

        <Phase name="InteractiveMode-Terminal-Integration">
          <Claude model="sonnet">
{CONTEXT}

## Task: Wire InteractiveMode to Terminal + Renderer + UI

Connect interactive.zig to the god-tui framework:
1. Read terminal/terminal.zig, rendering/renderer.zig
2. Read ui/header.zig, ui/chat.zig, ui/status.zig
3. Modify InteractiveMode to:
   - Initialize Terminal
   - Initialize RendererState
   - Create UI components (Header, Chat, Status)
   - Set up render loop
   - Handle keyboard input via Terminal.processInput
   - Route input to editor (not implemented yet, stub for now)
   - Display agent responses in Chat
4. Wire handleInput to send to Agent
5. Wire agent events to update Chat

Key patterns from spec:
- Terminal.start(on_input, on_resize, ctx)
- Renderer.render(lines, width) for differential updates  
- Use requestRender() for coalescing

Test modes: zig test modes/interactive.zig
Commit changes.
          </Claude>
        </Phase>

        <Phase name="Main-Wire-Everything">
          <Claude model="sonnet">
{CONTEXT}

## Task: Wire main.zig to instantiate real modes

Currently main.zig prints stubs. Wire it to:
1. Read current main.zig
2. Import modes/interactive.zig and modes/print.zig modules
3. Create Agent with config from CLI args
4. For print mode: instantiate PrintMode, call run(prompt)
5. For interactive mode: instantiate InteractiveMode, call run()
6. Handle signals (Ctrl+C) gracefully
7. Ensure terminal cleanup on exit

Build and test:
zig build
zig build run -- --help  
zig build run -- "Hello" (print mode)
zig build run -- (interactive mode, may not fully work yet)

Commit changes.
          </Claude>
        </Phase>

        <Phase name="E2E-Tests">
          <Claude model="sonnet">
{CONTEXT}

## Task: Create E2E integration tests

Create test/e2e.zig with integration tests:
1. Test CLI argument parsing → correct mode selection
2. Test print mode with mock provider → correct output
3. Test agent loop with mock provider → tool execution works
4. Test session persistence → can save/load session

Add to build.zig as a test target.

Also update STATUS.md:
- Mark Phase 12 as complete
- Document any remaining TODOs
- Add usage examples

Test: zig build test
Commit changes.
          </Claude>
        </Phase>

        <Phase name="Documentation">
          <Claude model="sonnet">
{CONTEXT}

## Task: Final documentation and polish

1. Update STATUS.md with complete status
2. Create/update README.md with:
   - Installation instructions
   - Usage examples
   - API documentation for library
   - Configuration options
3. Add inline documentation to key modules
4. Run final build + test verification:
   zig build
   zig build run -- --version
   zig test agent/agent.zig

Commit all changes with final message.
          </Claude>
        </Phase>

      </Ralph>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
console.log("=== GOD-TUI PHASE 12 INTEGRATION PLAN ===");
console.log(root.toXML());
console.log("==========================================\n");

root.mount(() => <Phase12Integration />);

// Keep alive
await new Promise(() => {});
