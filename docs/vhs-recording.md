---
title: VHS Recording
description: Terminal demo workflow with VHS tape files
---

# VHS Recording: Terminal Demo Workflow

This document describes how to create and maintain terminal recordings using VHS (CLI Home Video Recorder) for Smithers demos and documentation.

## VHS Overview

VHS is a tool for "writing terminal GIFs as code" - it allows you to create reproducible terminal recordings through declarative tape files instead of manual recording.

**GitHub:** https://github.com/charmbracelet/vhs
**Key Benefits:**
- Recordings as code (version controlled)
- Reproducible across machines
- CI/CD integration
- Multiple output formats (GIF, MP4, WebM, PNG)

## Installation

### macOS
```bash
brew install vhs
```

### Linux
```bash
# Debian/Ubuntu
sudo apt install ffmpeg ttyd
go install github.com/charmbracelet/vhs@latest

# Arch Linux
yay -S vhs
```

### Windows
```bash
choco install vhs
```

### Docker (for CI)
```bash
docker pull ghcr.io/charmbracelet/vhs:latest
```

## Tape File Format

VHS tape files (`.tape`) contain commands that describe terminal interactions.

### Basic Structure

```tape
# Output configuration
Output demo.gif

# Terminal settings
Set Shell bash
Set FontSize 32
Set Width 1200
Set Height 600
Set Theme "Monokai"

# Commands
Type "smithers run agent.tsx"
Sleep 500ms
Enter
Sleep 5s
```

### Configuration Commands

#### Output Settings
```tape
Output demo.gif              # GIF output
Output demo.mp4              # MP4 video
Output demo.webm             # WebM video
Output frames/              # PNG sequence
```

#### Terminal Settings
```tape
Set Shell <shell>           # bash, zsh, fish, powershell
Set FontSize <number>       # Default: 22
Set FontFamily <name>       # Default: "JetBrains Mono"
Set Theme <name>            # Color theme
Set Width <pixels>          # Default: 1200
Set Height <pixels>         # Default: 600
Set Padding <pixels>        # Frame padding
Set Margin <pixels>         # Video margins
Set MarginFill <color>      # Margin color
Set Framerate <fps>         # Default: 50
Set PlaybackSpeed <float>   # Default: 1.0
Set TypingSpeed <duration>  # Default: 50ms
Set LineHeight <float>      # Default: 1.0
Set LetterSpacing <float>   # Default: 1.0
Set LoopOffset <percent>    # Loop start point
```

#### Available Themes
```
Catppuccin Frappe, Catppuccin Latte, Catppuccin Macchiato, Catppuccin Mocha,
Dracula, GitHub Dark, GitHub Light, Monokai, Nord, Solarized Dark,
Solarized Light, Tokyo Night, and more
```

### Interaction Commands

#### Typing & Input
```tape
Type "hello world"          # Type text (respects TypingSpeed)
Enter                       # Press Enter
Tab                         # Press Tab
Backspace                   # Press Backspace
Delete                      # Press Delete
Space                       # Press Space (alternative to Type " ")
```

#### Key Combinations
```tape
Ctrl+C                      # Control + C
Ctrl+D                      # Control + D
Alt+F                       # Alt + F
Shift+Tab                   # Shift + Tab
Ctrl+Alt+Delete             # Multiple modifiers
```

#### Arrow Keys
```tape
Up                          # Arrow up
Down                        # Arrow down
Left                        # Arrow left
Right                       # Arrow right
```

#### Timing Commands
```tape
Sleep <duration>            # Wait (1s, 500ms, 1.5s)
Wait /regex/               # Wait until pattern appears
Hide                        # Hide subsequent typing
Show                        # Show typing again
```

#### Screenshot
```tape
Screenshot <file.png>       # Capture current frame
```

#### Clipboard
```tape
Copy "text"                 # Copy to clipboard
Paste                       # Paste from clipboard
```

#### Include
```tape
Source <file.tape>          # Include commands from another file
```

## Creating Smithers Demo Tapes

### Directory Structure

```
demos/
├── hello-world.tape         # Basic agent execution
├── multi-phase.tape         # Multi-phase workflow
├── code-review.tape         # Code review agent
├── error-handling.tape      # Error recovery
├── tui-navigation.tape      # TUI keyboard navigation
└── shared/
    ├── header.tape          # Common header settings
    └── footer.tape          # Common cleanup
```

### Template: Basic Demo

```tape
# demos/template.tape
Output demos/template.gif

# Settings
Source demos/shared/header.tape

# Title card
Type "# Smithers Demo"
Enter
Sleep 1s
Clear

# Demo content
Type "smithers run examples/hello-world.tsx"
Sleep 500ms
Enter
Sleep 3s

# Wait for completion
Wait /"Execution complete"/
Sleep 2s

# Cleanup
Source demos/shared/footer.tape
```

### Shared Header (`demos/shared/header.tape`)

```tape
Set Shell bash
Set FontSize 28
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set Margin 20
Set MarginFill "#1e1e2e"
Set TypingSpeed 50ms
Set PlaybackSpeed 1.0
```

### Example: Hello World Demo

```tape
# demos/hello-world.tape
Output demos/hello-world.gif

Source demos/shared/header.tape

# Title
Type "# Hello World Demo"
Enter
Sleep 1s
Clear

# Show the agent file
Type "cat examples/hello-world.tsx"
Enter
Sleep 3s

# Run the agent
Type "smithers run examples/hello-world.tsx --mock"
Enter
Sleep 2s

# Wait for plan approval
Wait /"Approve execution?"/
Sleep 1s
Type "y"
Enter

# Wait for completion
Wait /"Execution complete"/
Sleep 2s
```

### Example: TUI Navigation Demo

```tape
# demos/tui-navigation.tape
Output demos/tui-navigation.gif

Source demos/shared/header.tape

# Start with TUI mode
Type "smithers run examples/multi-phase.tsx --tui --mock"
Enter
Sleep 2s

# Wait for TUI to load
Wait /"Frame 1"/
Sleep 1s

# Navigate tree
Hide
Down
Show
Sleep 500ms

Hide
Down
Show
Sleep 500ms

# Expand node
Hide
Right
Show
Sleep 500ms

# View details
Hide
Enter
Show
Sleep 2s

# Go back
Hide
Escape
Show
Sleep 1s

# Exit
Ctrl+C
Sleep 1s
```

### Example: Error Handling Demo

```tape
# demos/error-handling.tape
Output demos/error-handling.gif

Source demos/shared/header.tape

# Run agent that will error
Type "smithers run examples/failing-agent.tsx --mock"
Enter
Sleep 2s

# Approve execution
Wait /"Approve?"/
Type "y"
Enter

# Wait for error
Wait /"Error:"/
Sleep 2s

# Show error details
Screenshot demos/error-screenshot.png
Sleep 2s
```

## Recording Live Sessions

VHS can generate tape files from live terminal sessions:

```bash
# Start recording
vhs record > my-session.tape

# Perform your demo actions...
# When done, exit to stop recording

# Edit the generated tape file
vim my-session.tape

# Generate the GIF
vhs my-session.tape
```

## Publishing Recordings

### Upload to vhs.charm.sh

```bash
vhs publish demo.gif
```

This provides shareable links in multiple formats:
- Web viewer: `https://vhs.charm.sh/abc123`
- HTML embed: `<iframe src="..."></iframe>`
- Markdown: `![Demo](https://vhs.charm.sh/abc123.gif)`

### Embedding in Documentation

#### Markdown
```markdown
![Hello World Demo](./demos/hello-world.gif)
```

#### HTML
```html
<video autoplay loop muted playsinline>
  <source src="./demos/hello-world.mp4" type="video/mp4">
</video>
```

#### README.md
```markdown
## Demo

Watch Smithers in action:

![Smithers Demo](./demos/hello-world.gif)
```

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/vhs.yml`:

```yaml
name: Generate Demo GIFs

on:
  push:
    branches: [main]
    paths:
      - 'demos/**/*.tape'
  pull_request:
    paths:
      - 'demos/**/*.tape'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate GIFs
        uses: charmbracelet/vhs-action@v2
        with:
          path: 'demos/*.tape'
          install-fonts: true
      
      - name: Commit generated GIFs
        if: github.ref == 'refs/heads/main'
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add demos/*.gif demos/*.mp4
          git commit -m "Update demo recordings" || exit 0
          git push
```

### vhs-action Configuration

| Input | Purpose | Default |
|-------|---------|---------|
| `path` | Tape file(s) to render | (required) |
| `version` | VHS version | `latest` |
| `token` | GitHub token | `${{ github.token }}` |
| `install-fonts` | Install additional fonts | `false` |

### Docker Usage (CI)

```bash
docker run --rm -v $PWD:/vhs ghcr.io/charmbracelet/vhs:latest demos/hello-world.tape
```

## Best Practices

### 1. Keep Recordings Short
- Target 30-60 seconds per demo
- Break complex workflows into multiple recordings
- Use `LoopOffset` for seamless loops

### 2. Use Consistent Settings
- Create shared header file for settings
- Use same theme across all demos
- Standardize timing (TypingSpeed, PlaybackSpeed)

### 3. Wait for Output
```tape
# Bad: Hard-coded sleep
Sleep 5s

# Good: Wait for specific output
Wait /"Execution complete"/
Sleep 1s  # Brief pause after completion
```

### 4. Hide Sensitive Info
```tape
# Hide API key entry
Hide
Type "export ANTHROPIC_API_KEY=sk-..."
Enter
Show
```

### 5. Add Context
```tape
# Show what we're running
Type "# Running multi-phase agent"
Enter
Sleep 1s

# Clear before actual demo
Clear
```

### 6. Optimize File Size
```tape
# Use smaller dimensions for web
Set Width 1000
Set Height 600

# Lower framerate for GIFs
Set Framerate 30

# Shorter sleep times
Sleep 500ms  # Instead of 2s
```

## Testing Tapes

### Render Locally

```bash
# Generate GIF
vhs demos/hello-world.tape

# View result
open demos/hello-world.gif
```

### Batch Render

```bash
# Render all tapes
for tape in demos/*.tape; do
  vhs "$tape"
done
```

### Watch Mode (not built-in)

```bash
# Use watchexec or similar
watchexec -e tape -w demos/ 'vhs demos/hello-world.tape'
```

## Troubleshooting

### Command Not Found

```tape
# Ensure PATH includes bun/smithers
Type "export PATH=$PATH:~/.bun/bin"
Enter
```

### Timing Issues

```tape
# If output appears slowly, increase sleep
Sleep 5s  # Instead of 2s

# Or wait for specific text
Wait /"Expected text"/
```

### Terminal Size

```tape
# If content is cut off, increase dimensions
Set Width 1600
Set Height 900
```

### Theme Not Found

```bash
# List available themes
vhs themes
```

## Demo Recording Checklist

Before recording:
- [ ] Script is tested and works
- [ ] Terminal is clean (no sensitive info)
- [ ] Font size is readable
- [ ] Colors contrast well
- [ ] Timing feels natural

After recording:
- [ ] GIF/video plays smoothly
- [ ] All text is readable
- [ ] Duration is appropriate (30-60s)
- [ ] File size is reasonable (<5MB for GIFs)
- [ ] Loop point is seamless (if applicable)

## Maintenance

### Updating Recordings

When CLI changes:
1. Update affected `.tape` files
2. Re-render GIFs locally
3. Test in browser/documentation
4. Commit changes
5. CI will regenerate on push

### Versioning

```tape
# Include version in recording
Type "# Smithers v0.2.0 Demo"
Enter
Sleep 1s
```

## Examples to Create

### Priority Demos (MVP)

1. **hello-world.tape** - Basic agent execution
2. **multi-phase.tape** - State-driven multi-phase workflow
3. **tui-navigation.tape** - TUI keyboard navigation
4. **code-review.tape** - Real-world code review agent

### Advanced Demos

5. **parallel-agents.tape** - Subagent orchestration
6. **error-recovery.tape** - Error handling and retries
7. **mcp-integration.tape** - Using MCP servers
8. **custom-tools.tape** - Custom tool implementation

## Resources

- **VHS Repository:** https://github.com/charmbracelet/vhs
- **VHS Action:** https://github.com/charmbracelet/vhs-action
- **Examples:** https://github.com/charmbracelet/vhs/tree/main/examples
- **Documentation:** https://github.com/charmbracelet/vhs#readme

## Next Steps

1. Install VHS and dependencies
2. Create `demos/` directory structure
3. Write basic hello-world.tape
4. Set up GitHub Actions workflow
5. Document demos in README.md
