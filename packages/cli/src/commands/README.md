# CLI Commands

Individual command implementations for the Smithers CLI.

## Files

### `run.ts`

The main command for executing agents.

```bash
smithers run <file> [options]
```

**Flow:**
1. Load config file
2. Parse props JSON
3. Load agent file (TSX/MDX)
4. Render to XML plan
5. Display plan with syntax highlighting
6. Prompt for approval (unless `--yes`)
7. Execute via `executePlan()`
8. Display execution results
9. Write output to file (if `--output`)

### `plan.ts`

Preview command for viewing plans without execution.

```bash
smithers plan <file> [options]
```

**Flow:**
1. Load agent file
2. Render to XML plan
3. Display plan
4. Optionally write to file

### `init.ts`

Project scaffolding command.

```bash
smithers init [directory] [options]
```

**Creates:**
- `package.json` with Smithers dependency
- `tsconfig.json` configured for JSX
- `src/agent.tsx` starter template
- `.env.example` for API keys

## Shared Utilities

Commands use shared utilities from the parent directory:

- `loader.ts` - File loading
- `config.ts` - Configuration
- `display.ts` - Terminal output
- `prompt.ts` - User prompts
