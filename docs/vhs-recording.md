# VHS Recording Documentation

This document explains how to use VHS (Video Home System) to create terminal session recordings for Smithers TUI demos and documentation.

## Overview

[VHS](https://github.com/charmbracelet/vhs) is a CLI tool from Charmbracelet for recording terminal sessions and generating GIFs, MP4s, and WebMs. It uses "tape files" (`.tape`) that contain instructions for what to type and how to capture the output.

**Key Benefits:**
- **Deterministic** - Same tape file produces identical output every time
- **Automatable** - Runs in CI/CD pipelines
- **Multi-format** - Outputs GIF, MP4, WebM, or PNG sequences
- **Themeable** - Supports 40+ built-in terminal themes

## Installation

### Prerequisites

VHS requires two dependencies:
1. **ttyd** - Terminal multiplexer (https://github.com/tsl0922/ttyd)
2. **ffmpeg** - Video encoding tool

### macOS Installation

```bash
# Install VHS with dependencies
brew install vhs

# Verify installation
vhs --version
```

### Linux Installation

#### Debian/Ubuntu
```bash
# Install dependencies
sudo apt install ttyd ffmpeg

# Install VHS
echo 'deb [trusted=yes] https://repo.charm.sh/apt/ /' | sudo tee /etc/apt/sources.list.d/charm.list
sudo apt update
sudo apt install vhs
```

#### Fedora/RHEL
```bash
# Install dependencies
sudo dnf install ttyd ffmpeg

# Install VHS
echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=0' | sudo tee /etc/yum.repos.d/charm.repo
sudo dnf install vhs
```

#### Arch Linux
```bash
# Install from AUR
yay -S vhs ttyd ffmpeg
```

### Other Installation Methods

**Go Install:**
```bash
go install github.com/charmbracelet/vhs@latest
```

**Docker:**
```bash
docker run --rm -v $PWD:/vhs ghcr.io/charmbracelet/vhs <file>.tape
```

**Windows:**
```bash
# Using winget
winget install charmbracelet.vhs

# Using scoop
scoop install vhs
```

## Tape File Format

A tape file (`.tape`) contains a sequence of commands that VHS executes to produce a recording.

### Basic Structure

```tape
# Settings (must come first)
Output demo.gif
Set FontSize 18
Set Width 1200
Set Height 800

# Commands
Type "smithers run hello-world.mdx --tui"
Enter
Sleep 3s
Screenshot
```

### Settings Commands

All settings must appear at the top of the file before any action commands (except `TypingSpeed` which can appear anywhere).

#### Output

Specifies output file(s) and format(s). Multiple outputs are supported.

```tape
Output demo.gif
Output demo.mp4
Output demo.webm
Output frames/  # PNG sequence
```

**Supported formats:**
- `.gif` - Animated GIF
- `.mp4` - H.264 video
- `.webm` - WebM video
- `directory/` - PNG image sequence

#### Terminal Configuration

```tape
Set Shell bash                    # Shell to use (bash, fish, zsh, etc.)
Set FontSize 18                   # Font size in pixels (10-46+)
Set FontFamily "JetBrains Mono"   # Font typeface
Set Width 1200                    # Terminal width in pixels
Set Height 800                    # Terminal height in pixels
Set LetterSpacing 1               # Character spacing in pixels
Set LineHeight 1.2                # Line spacing multiplier
Set Theme "Catppuccin Mocha"      # Color theme (see vhs themes)
Set Padding 20                    # Frame padding in pixels
Set Margin 20                     # Frame margin in pixels
```

#### Window Styling

```tape
Set WindowBar Colorful           # Window bar style
Set BorderRadius 10              # Corner roundness in pixels
Set CursorBlink true             # Cursor animation on/off
```

#### Recording Settings

```tape
Set Framerate 60                 # Output FPS (30-60)
Set PlaybackSpeed 1.0            # Playback speed multiplier (0.5-2.0)
Set LoopOffset 5%                # Loop start time offset
```

#### Typing Behavior

```tape
Set TypingSpeed 100ms            # Delay between keystrokes
```

Unlike other settings, `TypingSpeed` can be changed mid-tape.

### Action Commands

#### Type

Simulates typing text with delays between characters.

```tape
Type "smithers run agent.mdx"
```

**Variable typing speed:**
```tape
Type@500ms "slow typing"         # Override TypingSpeed for this command
Type@50ms "fast typing"
```

**Special characters:**
- Use quotes for spaces: `Type "hello world"`
- Escape quotes: `Type "echo \"hello\""`

#### Special Keys

```tape
Enter                            # Press Enter/Return
Backspace                        # Press Backspace
Tab                              # Press Tab
Space                            # Press Space

# Arrow keys
Up
Down
Left
Right

# Page navigation
PageUp
PageDown

# Modifier combinations
Ctrl+C                           # Ctrl+C
Ctrl+Alt+Delete                  # Ctrl+Alt+Delete
Shift+Tab                        # Shift+Tab
```

#### Sleep

Pause execution for a duration.

```tape
Sleep 1s                         # Sleep for 1 second
Sleep 500ms                      # Sleep for 500 milliseconds
Sleep 2.5s                       # Sleep for 2.5 seconds
```

#### Wait

Wait for specific output to appear before continuing.

```tape
Wait[+Screen][+Line] /regex/
```

**Examples:**
```tape
Wait /Execution Complete/        # Wait for text to appear
Wait+Screen                      # Wait for any screen output
Wait+Line                        # Wait for new line
```

#### Screenshot

Capture a single frame (PNG).

```tape
Screenshot                       # Saved to screenshots/ directory
```

#### Show/Hide

Toggle visibility of subsequent commands in the recording.

```tape
Hide                             # Hide following commands
Type "secret setup command"
Show                             # Show following commands
Type "visible command"
```

#### Copy/Paste

Clipboard operations.

```tape
Copy "text to clipboard"         # Copy to clipboard
Paste                            # Paste from clipboard
```

#### Env

Set environment variables for the session.

```tape
Env ANTHROPIC_API_KEY "sk-ant-..."
Env NODE_ENV production
```

#### Source

Include commands from another tape file.

```tape
Source setup.tape                # Include all commands from setup.tape
```

#### Require

Declare required programs. VHS fails early if missing.

```tape
Require smithers                 # Requires 'smithers' command
Require node
Require bun
```

### Comments

```tape
# This is a comment
Type "hello"  # Inline comment
```

## Recording Workflows

### Creating a New Tape

```bash
# Generate template tape file
vhs new demo.tape

# Edit the file with your commands
vim demo.tape

# Execute the tape
vhs demo.tape
```

### Recording from Live Session

VHS can record your actual terminal session and generate a tape file:

```bash
# Start recording
vhs record > demo.tape

# Perform actions in the terminal
# ... do stuff ...

# Exit to stop recording (Ctrl+D or 'exit')
exit

# Play back the recording
vhs demo.tape
```

**Note:** Recording generates a tape file, which you can then edit before producing the final output.

### Iterative Development

```bash
# Edit tape file
vim demo.tape

# Regenerate output quickly
vhs demo.tape

# Review output
open demo.gif
```

Tip: Use `Wait+Screen` to speed up development by waiting for output instead of hard-coded `Sleep` durations.

## VHS GitHub Action

Automate recording generation in CI/CD using the [vhs-action](https://github.com/charmbracelet/vhs-action).

### Basic Workflow

Create `.github/workflows/vhs.yml`:

```yaml
name: Generate VHS Recordings

on:
  push:
    branches: [main]
    paths:
      - 'demos/**/*.tape'
  pull_request:
    paths:
      - 'demos/**/*.tape'

jobs:
  generate-recordings:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Smithers
        run: |
          # Install bun
          curl -fsSL https://bun.sh/install | bash
          export PATH="$HOME/.bun/bin:$PATH"

          # Install smithers CLI
          bun install
          bun run build

      - name: Generate recordings
        uses: charmbracelet/vhs-action@v2
        with:
          path: 'demos'  # Directory containing .tape files
          # or
          # path: 'demos/demo1.tape demos/demo2.tape'

      - name: Commit generated GIFs
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: regenerate VHS recordings'
          file_pattern: 'demos/*.gif'
```

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `path` | Tape file(s) or directory | Required |
| `install-fonts` | Install custom fonts | `false` |

### Advanced Example

```yaml
- name: Generate recordings with custom setup
  uses: charmbracelet/vhs-action@v2
  with:
    path: 'demos/demo.tape'
    install-fonts: true
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    SMITHERS_MOCK: 'true'  # Use mock mode for CI
```

## Smithers Demos

Smithers includes 4 demo tape files in the `demos/` directory showcasing the TUI:

### Demo 1: Basic Execution (`demos/01-basic-execution.tape`)

**Purpose:** Demonstrate basic TUI navigation and execution flow.

**Shows:**
- Running smithers with `--tui` flag
- Basic tree navigation with arrow keys
- Expanding nodes to see children
- Watching execution progress

**Duration:** ~10 seconds

**To run:**
```bash
vhs demos/01-basic-execution.tape
```

### Demo 2: Tree Navigation (`demos/02-tree-navigation.tape`)

**Purpose:** Showcase keyboard navigation capabilities.

**Shows:**
- Navigating up/down through tree nodes
- Expanding/collapsing nodes with right/left arrows
- Navigating into nested structures
- Smooth keyboard-driven interaction

**Duration:** ~15 seconds

**To run:**
```bash
vhs demos/02-tree-navigation.tape
```

### Demo 3: Agent Details (`demos/03-agent-details.tape`)

**Purpose:** Show agent detail view with prompt and output inspection.

**Shows:**
- Entering detail view with Enter key
- Viewing agent prompts and outputs
- Scrolling through long outputs
- Returning to tree view with Escape
- Navigating between different agents

**Duration:** ~20 seconds

**To run:**
```bash
vhs demos/03-agent-details.tape
```

### Demo 4: Multi-Phase Workflow (`demos/04-multi-phase.tape`)

**Purpose:** Demonstrate complex multi-phase execution.

**Shows:**
- Navigating through multiple phases
- Expanding phases to see component agents
- Watching state transitions in real-time
- Complex nested tree structures

**Duration:** ~25 seconds

**To run:**
```bash
vhs demos/04-multi-phase.tape
```

### Demo Files Location

All demo tape files are in the `demos/` directory:

```
demos/
├── README.md                   # Comprehensive demo documentation
├── 01-basic-execution.tape     # Basic TUI demo
├── 02-tree-navigation.tape     # Navigation demo
├── 03-agent-details.tape       # Detail view demo
└── 04-multi-phase.tape         # Multi-phase demo
```

After running VHS, the corresponding `.gif` files will be generated in the same directory.

### Generating All Demos

From project root:

```bash
cd demos/
vhs 01-basic-execution.tape
vhs 02-tree-navigation.tape
vhs 03-agent-details.tape
vhs 04-multi-phase.tape
```

Or use the GitHub Action (see CI/CD Integration section below).

## Best Practices

### 1. Use Wait Instead of Sleep

```tape
# Bad - may be too short or too long
Type "smithers run agent.mdx"
Enter
Sleep 5s

# Good - waits for actual output
Type "smithers run agent.mdx"
Enter
Wait /Execution Complete/
Sleep 500ms  # Brief pause for viewer to see result
```

### 2. Set Appropriate Dimensions

```tape
# For code-heavy demos
Set Width 1400
Set Height 1000
Set FontSize 14

# For simple command demos
Set Width 1000
Set Height 600
Set FontSize 16
```

### 3. Choose Readable Themes

Popular themes for demos:
- **Catppuccin Mocha** - Modern, purple-ish, good contrast
- **Dracula** - Popular dark theme
- **Nord** - Clean, minimal
- **Tokyo Night** - Trendy, easy on eyes
- **Gruvbox** - Retro, warm colors

See all themes: `vhs themes`

### 4. Balance Speed and Readability

```tape
# Fast typing for commands (not the focus)
Set TypingSpeed 50ms
Type "cd my-project"

# Slower typing for important commands (the focus)
Set TypingSpeed 150ms
Type "smithers run agent.mdx --tui"
```

### 5. Add Context with Comments

```tape
# Show the help output first
Type "smithers --help"
Enter
Sleep 2s

# Now run the actual command
Type "smithers run hello.mdx"
Enter
```

Comments don't appear in output but help maintain the tape file.

### 6. Keep Recordings Short

Aim for 10-30 seconds per recording. Longer recordings:
- Result in large file sizes
- Lose viewer attention
- Are harder to maintain

Break complex workflows into multiple short demos.

### 7. Test on Real Terminal Size

Before finalizing, test your tape with a terminal sized to your `Width` and `Height` settings to ensure content isn't cut off.

### 8. Use Mock Mode for CI

For GitHub Actions, use mock execution to avoid API calls:

```tape
Env SMITHERS_MOCK true
Type "smithers run agent.mdx --tui"
Enter
```

## File Organization

Organize demos in a dedicated directory:

```
demos/
├── README.md              # Index of all demos
├── 01-basic-execution.tape
├── 01-basic-execution.gif
├── 02-agent-details.tape
├── 02-agent-details.gif
├── 03-multi-phase.tape
├── 03-multi-phase.gif
├── 04-error-recovery.tape
└── 04-error-recovery.gif
```

**Naming Convention:**
- Prefix with numbers for ordering: `01-`, `02-`, etc.
- Use descriptive names: `basic-execution`, `agent-details`
- Keep tape and output files together

## Troubleshooting

### VHS Command Not Found

```bash
# Verify installation
which vhs

# Reinstall if needed
brew reinstall vhs  # macOS
```

### Missing ttyd or ffmpeg

```bash
# Check dependencies
which ttyd
which ffmpeg

# Install if missing
brew install ttyd ffmpeg  # macOS
sudo apt install ttyd ffmpeg  # Ubuntu/Debian
```

### Font Not Found

```bash
# List available fonts
vhs fonts

# Use a common font
Set FontFamily "Monaco"  # macOS built-in
Set FontFamily "Courier New"  # Cross-platform
```

### Recording Too Large

Reduce file size:

```tape
# Lower framerate
Set Framerate 30  # Instead of 60

# Smaller dimensions
Set Width 1000   # Instead of 1400
Set Height 600   # Instead of 900

# Use MP4 instead of GIF
Output demo.mp4  # Smaller than GIF
```

### Timing Issues

If commands execute before output appears:

```tape
# Use Wait instead of Sleep
Wait /expected output/
Sleep 500ms  # Small buffer for viewer

# Or increase sleep duration
Sleep 3s  # If Wait is not possible
```

### Output Not Generated

```bash
# Run with verbose output
vhs --verbose demo.tape

# Check for syntax errors in tape file
# Common issues:
# - Settings after action commands
# - Missing quotes around strings with spaces
# - Invalid regex in Wait commands
```

## Integration with Documentation

### Embedding in Mintlify Docs

```mdx
# Quick Start

See Smithers TUI in action:

![Basic execution](../../demos/01-basic-execution.gif)

## Multi-Phase Workflows

Smithers supports complex multi-phase agent execution:

![Multi-phase workflow](../../demos/03-multi-phase.gif)
```

### Embedding in README

```markdown
## Smithers TUI

Interactive terminal UI for monitoring agent execution:

![Smithers TUI Demo](demos/01-basic-execution.gif)
```

### Embedding in GitHub PR

Add demos to PR descriptions to showcase new features:

```markdown
## Added TUI Support

This PR adds an interactive TUI for the `smithers run` command:

![Demo](https://raw.githubusercontent.com/user/smithers/branch/demos/tui-demo.gif)
```

## CI/CD Integration

### Automated Regeneration

Set up a workflow to regenerate demos when tape files change:

```yaml
name: Regenerate Demos

on:
  push:
    paths:
      - 'demos/**/*.tape'
      - 'src/tui/**/*.tsx'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: charmbracelet/vhs-action@v2
        with:
          path: 'demos'
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: regenerate demos'
          file_pattern: 'demos/*.gif'
```

### PR Preview

Generate demo previews for pull requests:

```yaml
name: PR Demo Preview

on: pull_request

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: charmbracelet/vhs-action@v2
        with:
          path: 'demos'
      - uses: actions/upload-artifact@v4
        with:
          name: demo-previews
          path: demos/*.gif
```

Reviewers can download artifacts to preview changes.

## Resources

- [VHS GitHub Repository](https://github.com/charmbracelet/vhs)
- [VHS Documentation](https://github.com/charmbracelet/vhs/blob/main/README.md)
- [VHS GitHub Action](https://github.com/charmbracelet/vhs-action)
- [Charmbracelet Blog](https://charm.sh/blog/)
- [ttyd GitHub](https://github.com/tsl0922/ttyd)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

## Next Steps

1. ✅ Complete this documentation
2. Install VHS and dependencies locally
3. Create `demos/` directory structure
4. Write first demo tape file (basic execution)
5. Test demo generation locally
6. Set up GitHub Action for automated regeneration
7. Create remaining demo tapes (agent details, multi-phase, errors)
8. Embed demos in README and docs
