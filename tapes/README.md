# VHS Tapes

Marketing demo GIFs for Smithers using [Charm VHS](https://github.com/charmbracelet/vhs).

## Prerequisites

```bash
# Install VHS
brew install charmbracelet/tap/vhs

# Install gum (for styled output)
brew install charmbracelet/tap/gum
```

## Generate GIFs

```bash
# Generate all GIFs
for tape in tapes/*.tape; do vhs "$tape"; done

# Generate a single GIF
vhs tapes/01_taro_hello.tape
```

## Tapes

| Tape | Purpose | Output |
|------|---------|--------|
| `01_taro_hello.tape` | JSX workflow + SQLite persistence | Hello Smithers demo |
| `02_matcha_plugin.tape` | Plugin-first onboarding | Claude Code plugin |
| `03_brown_sugar_resume.tape` | Durable Ralphing (stop/restart/resume) | Durability demo |
| `04_thai_tea_worktrees.tape` | Worktree isolation + parallelism | Safe parallelism |
| `05_oolong_vcs_primitives.tape` | Commits + git notes + audit trail | VCS integration |
| `06_jasmine_observability.tape` | Queryable execution history | Flight recorder |
| `07_lychee_structured_output.tape` | Zod schema + typed JSON | Structured output |
| `08_honeydew_subagents.tape` | Nested Smithers in Worktree | Subagents demo |
| `09_wintermelon_safety.tape` | Tool allowlists + permission gating | Safety controls |
| `10_strawberry_gallery.tape` | Example menu / CTA | Gallery GIF |

## Customization

All tapes use:
- **Theme:** Catppuccin Frappe
- **Font:** JetBrains Mono
- **Resolution:** 1200x675
- **Framerate:** 30fps

Tapes are designed to be deterministic and storybook-style. Commands prefixed with `#` are display-only—remove the `# ` prefix to make them execute live.

## Copying to docs

After generating, copy GIFs to docs/images:

```bash
cp tapes/*.gif docs/images/
```

GIFs are already generated and committed in `docs/images/`.
