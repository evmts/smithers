# Smithers TUI Demos

This directory contains VHS tape files and generated recordings demonstrating the Smithers Terminal UI (TUI).

## Overview

The Smithers TUI provides an interactive terminal interface for monitoring agent execution in real-time. These demos showcase key features:

- **Tree navigation** - Browse the agent execution tree with arrow keys
- **Agent details** - View prompts and outputs for individual agents
- **Multi-phase workflows** - Watch complex state transitions
- **Execution status** - Real-time status updates (pending/running/complete/error)

## Available Demos

| Demo | File | Description | Duration |
|------|------|-------------|----------|
| 1. Basic Execution | `01-basic-execution.tape` | Simple agent execution with TUI navigation | ~10s |
| 2. Tree Navigation | `02-tree-navigation.tape` | Keyboard navigation, expand/collapse nodes | ~15s |
| 3. Agent Details | `03-agent-details.tape` | Viewing agent prompts and output, scrolling | ~20s |
| 4. Multi-Phase | `04-multi-phase.tape` | Complex workflow with multiple phases | ~25s |

## Prerequisites

To generate or regenerate these recordings, you need:

1. **VHS** - Terminal session recorder
2. **ttyd** - Terminal multiplexer
3. **ffmpeg** - Video encoder
4. **Smithers CLI** - Installed and available in PATH

### Installation

**macOS:**
```bash
brew install vhs
```

**Ubuntu/Debian:**
```bash
sudo apt install ttyd ffmpeg
echo 'deb [trusted=yes] https://repo.charm.sh/apt/ /' | sudo tee /etc/apt/sources.list.d/charm.list
sudo apt update
sudo apt install vhs
```

**Verify:**
```bash
vhs --version
```

## Generating Recordings

### Generate All Demos

```bash
# From project root
cd demos/
vhs 01-basic-execution.tape
vhs 02-tree-navigation.tape
vhs 03-agent-details.tape
vhs 04-multi-phase.tape
```

### Generate Single Demo

```bash
vhs demos/01-basic-execution.tape
```

Output files (`.gif`) will be created in the `demos/` directory alongside the tape files.

## Keyboard Shortcuts in TUI

These are the keyboard shortcuts demonstrated in the recordings:

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate tree nodes (up/down) |
| `←/→` | Collapse/expand nodes |
| `Enter` | View agent details (prompt/output) |
| `Escape` | Return to tree view from detail view |
| `Space` | Toggle expand/collapse |
| `↑/↓` (in detail view) | Scroll output |
| `PageUp/PageDown` | Scroll output (page at a time) |
| `q` | Quit TUI |

## Customizing Demos

Each tape file can be customized by editing the settings:

```tape
# Terminal appearance
Set FontSize 16              # Font size (10-46+)
Set Width 1200               # Terminal width in pixels
Set Height 800               # Terminal height in pixels
Set Theme "Catppuccin Mocha" # Color theme

# Typing behavior
Set TypingSpeed 50ms         # Delay between keystrokes
```

**Available Themes:**
- Catppuccin Mocha (purple-ish, modern)
- Dracula (popular dark theme)
- Nord (clean, minimal)
- Tokyo Night (trendy, easy on eyes)
- Gruvbox (retro, warm colors)

List all themes: `vhs themes`

## Mock Mode

All demos use `--mock` flag to avoid making real API calls. This ensures:
- Fast, deterministic execution
- No API key required
- Safe to run in CI/CD
- Consistent output for recordings

## CI/CD Integration

Recordings are automatically regenerated when tape files or TUI code changes. See `.github/workflows/vhs.yml` for details.

**Trigger regeneration:**
```bash
# Make changes to tape file
vim demos/01-basic-execution.tape

# Commit the change
git add demos/01-basic-execution.tape
git commit -m "docs: update basic execution demo"
git push

# GitHub Action will automatically regenerate the GIF
```

## Troubleshooting

### VHS command not found

```bash
# macOS
brew install vhs

# Linux
# See installation instructions above
```

### Missing ttyd or ffmpeg

```bash
which ttyd
which ffmpeg

# macOS
brew install ttyd ffmpeg

# Ubuntu/Debian
sudo apt install ttyd ffmpeg
```

### Smithers command not found

Ensure Smithers CLI is installed and in PATH:

```bash
# From project root
bun install
bun run build

# Add to PATH or use absolute path in tape files
which smithers
```

### Recording too large

Reduce file size by:

```tape
Set Framerate 30     # Instead of 60
Set Width 1000       # Smaller dimensions
Set Height 600
Output demo.mp4      # MP4 is smaller than GIF
```

### Timing issues

If commands execute before output appears:

```tape
# Use Wait instead of Sleep
Wait /expected text/
Sleep 500ms  # Buffer for viewer

# Or increase sleep duration
Sleep 3s
```

## Adding New Demos

To create a new demo:

1. **Create tape file**: `demos/05-my-feature.tape`
2. **Add output command**: `Output demos/05-my-feature.gif`
3. **Configure settings** (font, size, theme)
4. **Add commands** (Type, Enter, Sleep, arrow keys, etc.)
5. **Test locally**: `vhs demos/05-my-feature.tape`
6. **Update this README** with new demo in table
7. **Commit** both tape and gif files

**Template:**
```tape
# Demo 5: My Feature
# Description of what this demonstrates

Output demos/05-my-feature.gif

Set FontSize 16
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# Your commands here
Type "smithers run example.tsx --tui --mock"
Enter
Sleep 2s

# ... interactions ...

Type "q"
Sleep 500ms
```

## Resources

- [VHS Documentation](https://github.com/charmbracelet/vhs)
- [VHS GitHub Action](https://github.com/charmbracelet/vhs-action)
- [Smithers TUI Design](../docs/tui-design.md)
- [VHS Recording Guide](../docs/vhs-recording.md)

## Questions?

If you encounter issues or have questions about the demos, please:

1. Check the [VHS Documentation](https://github.com/charmbracelet/vhs)
2. Review [docs/vhs-recording.md](../docs/vhs-recording.md)
3. Open an issue on GitHub
