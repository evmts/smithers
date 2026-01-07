# smithers

## 1.0.0

### Major Changes

- 6c913d3: # Major Release: TUI, Interactive Commands, GitHub Action, and Sophisticated Examples

  This release represents a major milestone for Smithers with comprehensive new features:

  ## TUI Integration (✨ NEW)

  - **Interactive Terminal UI** using OpenTUI
    - Real-time execution monitoring with tree view
    - Keyboard navigation (arrow keys, enter, escape)
    - Agent detail panel with streaming output
    - Responsive layout with status bar
  - **VHS Demo Recording** infrastructure
    - 4 demo tapes showcasing TUI features
    - Automated GIF generation in CI
    - Comprehensive recording documentation

  ## Interactive CLI Commands (✨ NEW)

  - **Execution Control**: `/pause`, `/resume`, `/abort`
  - **Inspection**: `/status`, `/tree`, `/focus <path>`
  - **Manipulation**: `/skip [<path>]`, `/inject <prompt>`
  - **Help**: `/help [cmd]`
  - **ExecutionController API** for programmatic control
  - 30 comprehensive tests

  ## GitHub Action (✨ NEW)

  - **CI/CD Integration** for running Smithers agents
  - Mock mode support for testing
  - Artifact uploads and job summaries
  - Manual approval gates via GitHub Environments
  - 5 documented workflow examples
  - Security best practices

  ## Worktree Component (✨ NEW)

  - `<Worktree>` component for parallel agent isolation
  - Git worktree lifecycle management
  - Automatic cwd injection for child agents
  - Optional cleanup with error handling
  - Security: branch name validation, command injection prevention

  ## ClaudeProvider (✨ NEW)

  - Rate limiting (requests/tokens per minute)
  - Usage tracking and budget enforcement
  - Cost estimation for all Claude models
  - Event callbacks for rate limits and usage updates
  - Token bucket algorithm implementation

  ## Workflow System (✨ NEW)

  - Reactive workflow state management
  - Schema-driven input/output with Zod
  - Automatic tool generation from schemas
  - Incremental iterations with value persistence
  - Full TypeScript type safety

  ## Sophisticated Examples (6 new)

  - **06-file-processor**: Multi-phase file transformation pipeline
  - **07-git-helper**: AI-powered git operations interface
  - **08-test-generator**: Automated test generation from source
  - **09-parallel-worktrees**: Parallel feature development
  - **10-mcp-integration**: MCP server integration patterns
  - **11-rate-limited-batch**: Large-scale batch processing

  ## Documentation (📚)

  - Comprehensive API documentation for all components
  - 8 detailed guides (testing, error-handling, MCP integration, TUI usage, interactive commands)
  - 13 example walkthroughs
  - 3 CLI command references
  - Mintlify docs configuration complete

  ## Testing (✅)

  - 707 total tests passing
  - 619 Smithers-specific tests
  - Comprehensive coverage:
    - CLI tests (34)
    - Loader tests (33)
    - Renderer tests (32)
    - Component tests (44)
    - Edge case tests (29)
    - Interactive tests (30)
    - Worktree tests (18)
    - Output/File component tests (45+)

  ## Bug Fixes (🐛)

  - Fixed React 19 async rendering issues
  - Fixed execution state keying collisions
  - Fixed content hashing with BigInt/circular refs
  - Fixed loader ESM compatibility
  - Fixed MCP client capabilities
  - Fixed example bugs (test-generator, file-processor, rate-limited-batch)

  ## Breaking Changes (⚠️)

  - `onHumanPrompt` callback signature enhanced (backwards compatible via .length detection)
  - ClaudeProvider rate/usage limit props now reactive
  - Workflow store.values changed to getter (was field)

  This is a production-ready release with comprehensive features, documentation, and testing.
