---
title: VHS Recording
description: How to record Smithers terminal demos with VHS
---

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
- `.gif` - Animated GIF (larger file size, universal support)
- `.mp4` - H.264 video (smaller file size, good quality)
- `.webm` - WebM video (smallest file size, web-optimized)
- `directory/` - PNG image sequence (for advanced editing)
- `.txt` - ASCII text output (for golden file testing)
- `.ascii` - ASCII art output (for integration testing)

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
Set WindowBar Colorful           # Window bar style (Rings, RingsRight, Colorful, ColorfulRight)
Set WindowBarSize 40             # Window bar height in pixels (default 40)
Set BorderRadius 10              # Corner roundness in pixels
Set CursorBlink true             # Cursor animation on/off
Set MarginFill "#1e1e2e"         # Color to fill margin with (hex or file path)
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
Escape                           # Press Escape
Delete                           # Press Delete
Insert                           # Press Insert

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
Alt+F4                           # Alt+F4

# Repeat keys with optional timing
Enter@500ms 3                    # Press Enter 3 times with 500ms delay
Down 5                           # Press Down 5 times
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

## VHS Publishing and Sharing

### Publishing to vhs.charm.sh

VHS provides a built-in publishing service to share your recordings:

```bash
# Generate and publish in one command
vhs publish demo.tape

# Or publish an existing GIF
vhs publish demo.gif
```

This uploads your recording to `vhs.charm.sh` and provides:
- **Browser link** - View in browser
- **HTML embed code** - Embed in websites
- **Markdown link** - Share in docs

### Self-Hosted VHS Server

Run your own VHS server for team sharing:

```bash
# Start VHS server on port 1976
vhs serve

# Access from other machines
vhs <remote-host>:1976 demo.tape
```

This enables:
- Running tapes from any machine on your network
- Centralized recording generation
- Team collaboration on demos

### SSH Server Integration

VHS can execute tapes across networks via SSH:

```bash
# Run tape on remote server
vhs ssh://user@host:22 demo.tape
```

Use cases:
- Generate recordings on CI servers
- Test across different environments
- Collaborate with remote teams

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
| `version` | VHS version to use | `latest` |
| `token` | GitHub token | `${{ github.token }}` |

### Available Fonts

**Default font:** JetBrains Mono (always available)

**Additional fonts** (with `install-fonts: true`):
- Bitstream Vera Sans Mono
- DejaVu Sans Mono
- Fira Code
- Hack
- IBM Plex Mono
- Inconsolata
- Liberation Mono
- Roboto Mono
- Source Code Pro
- Ubuntu Mono
- Plus nerd font variations for each

Check available fonts locally:
```bash
vhs fonts
```

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
- **Monokai** - Classic, high contrast
- **Solarized Dark** - Easy on eyes, well-balanced
- **One Dark** - Popular VS Code theme
- **Material Design** - Clean, modern
- **Synthwave** - Neon aesthetic for fun demos

See all 350+ themes: `vhs themes`

**Custom themes:**
```tape
Set Theme { "name": "custom", "black": "#000000", "red": "#ff0000", ... }
```

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

### 9. Optimize for Different Platforms

```tape
# macOS optimized (Retina displays)
Set Width 1400
Set Height 900
Set FontSize 16

# Web optimized (smaller file size)
Set Width 1000
Set Height 600
Set Framerate 30
Output demo.webm  # Smallest file size
```

### 10. Use Hide/Show for Setup/Cleanup

```tape
# Hide setup commands
Hide
Type "cd /tmp && mkdir demo && cd demo"
Enter
Type "npm install smithers"
Enter
Show

# Now show the actual demo
Type "smithers run agent.mdx"
Enter
Wait /Complete/

# Hide cleanup
Hide
Type "cd .. && rm -rf demo"
Enter
```

### 11. Create Smooth Loops

Use `LoopOffset` to create seamless GIF loops:

```tape
Set LoopOffset 5%  # Start loop 5% into the recording

# Your demo commands
Type "smithers run agent.mdx"
Enter
Wait /Complete/
Sleep 2s
```

### 12. Test Recordings Quickly

```bash
# Generate low-quality preview for quick iteration
Set Framerate 15
Set Width 800
Set Height 500

# When satisfied, increase quality
Set Framerate 60
Set Width 1400
Set Height 900
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

**Common Issue:** On Ubuntu/Debian, the deb package doesn't include ttyd as a dependency. You must install it manually:
```bash
# Download latest ttyd from GitHub releases
wget https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64
chmod +x ttyd.x86_64
sudo mv ttyd.x86_64 /usr/local/bin/ttyd
```

**Version Issues:** VHS requires ttyd 1.7.1 or later. Check your version:
```bash
ttyd --version
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

### ffmpeg Errors

**"Number of frames to loop is not set"**: This can result in an empty GIF. Use the `-v` flag for verbose ffmpeg output:
```bash
vhs -v demo.tape
```

**"Unrecognized option 'crf'"**: Your ffmpeg version may be outdated or missing codec support:
```bash
# Update ffmpeg
brew upgrade ffmpeg  # macOS
sudo apt update && sudo apt upgrade ffmpeg  # Ubuntu

# Or install with all codecs
brew install ffmpeg --with-all
```

**"Option 'whole_dur' not found"**: Audio filter compatibility issue. VHS primarily works with video, so this usually doesn't affect output.

### Browser Launch Errors

If `vhs publish` fails with browser errors, ensure you have a compatible browser installed or use the `--no-publish` flag:
```bash
vhs demo.tape  # Generate without publishing
```

### Performance Issues

If VHS is slow:
```bash
# Use lower framerate
Set Framerate 30  # Instead of 60

# Reduce terminal size
Set Width 1000
Set Height 600

# Use MP4 instead of GIF (faster encoding)
Output demo.mp4
```

## Advanced Examples

### Example 1: Multi-Step CLI Workflow

```tape
# Setup
Output workflow-demo.gif
Set FontSize 16
Set Width 1400
Set Height 900
Set Theme "Dracula"

Require smithers
Require node

# Show version
Type "smithers --version"
Enter
Sleep 1s

# Initialize project
Type "smithers init my-agent"
Enter
Wait /Created project/
Sleep 500ms

# Navigate and show structure
Type "cd my-agent && ls -la"
Enter
Sleep 2s

# Run the agent
Type "smithers run hello.mdx --tui"
Enter
Wait /Execution Complete/
Sleep 2s
```

### Example 2: Interactive TUI Navigation

```tape
# Setup
Output tui-navigation.gif
Set FontSize 18
Set Width 1200
Set Height 800
Set Theme "Tokyo Night"
Set TypingSpeed 50ms

# Start TUI
Type "smithers run multi-phase.mdx --tui"
Enter
Sleep 2s

# Navigate tree
Down 3
Sleep 500ms
Right  # Expand node
Sleep 500ms
Down 2
Sleep 500ms
Enter  # View details
Sleep 2s
Escape  # Back to tree
Sleep 500ms

# Navigate to different phase
Down 5
Right
Sleep 1s
```

### Example 3: Error Handling Demo

```tape
Output error-demo.gif
Set FontSize 16
Set Width 1200
Set Height 700
Set Theme "Monokai"

# Run command with missing file
Hide
Type "cd /tmp"
Enter
Show

Type "smithers run nonexistent.mdx"
Enter
Wait /Error:/
Sleep 2s

# Show help instead
Type "smithers run --help"
Enter
Sleep 3s
```

### Example 4: Integration Testing with Golden Files

```tape
# Generate text output for integration testing
Output test-output.txt

Require smithers

Type "smithers run agent.mdx"
Enter
Wait /Complete/
Sleep 1s
```

Then compare the `.txt` output in your test suite:
```bash
# In your test script
vhs test-recording.tape
diff test-output.txt expected-output.txt
```

### Example 5: Code Editor + Terminal Split

```tape
Output code-demo.gif
Set FontSize 14
Set Width 1600
Set Height 900
Set Theme "Nord"

# Show code file first
Type "cat agent.mdx"
Enter
Sleep 3s

# Split with execution
Type "smithers run agent.mdx"
Enter
Wait /Execution Complete/
Sleep 2s
```

### Example 6: Using Source for Modular Tapes

Create `setup.tape`:
```tape
# Common setup
Set FontSize 16
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"
Env SMITHERS_MOCK true
```

Then in your demo tapes:
```tape
Source setup.tape
Output demo1.gif

Type "smithers run demo1.mdx"
Enter
Sleep 3s
```

```tape
Source setup.tape
Output demo2.gif

Type "smithers run demo2.mdx"
Enter
Sleep 3s
```

### Example 7: Complex Multi-Agent Execution

```tape
Output multi-agent.gif
Set FontSize 15
Set Width 1400
Set Height 1000
Set Theme "Gruvbox Dark"
Set TypingSpeed 75ms

# Run multi-agent workflow
Type "smithers run code-review.mdx --tui"
Enter
Sleep 1s

# Wait for first agent to complete
Wait /✓ Code Analyzer/
Sleep 500ms

# Navigate to view first agent
Down 2
Enter
Sleep 2s
Escape

# Wait for second agent
Wait /✓ Security Reviewer/
Sleep 500ms

# Show final results
Down 3
Enter
Sleep 3s
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

### Official Documentation
- [VHS GitHub Repository](https://github.com/charmbracelet/vhs) - Main project repository
- [VHS README](https://github.com/charmbracelet/vhs/blob/main/README.md) - Complete documentation
- [VHS Themes](https://github.com/charmbracelet/vhs/blob/main/THEMES.md) - All 350+ available themes
- [VHS Examples](https://github.com/charmbracelet/vhs/tree/main/examples) - Official example tape files
- [VHS GitHub Action](https://github.com/charmbracelet/vhs-action) - CI/CD integration
- [VHS Action Marketplace](https://github.com/marketplace/actions/vhs-action) - GitHub Actions listing

### Dependencies
- [ttyd GitHub](https://github.com/tsl0922/ttyd) - Terminal multiplexer dependency
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html) - Video encoding tool

### Community Resources
- [Charmbracelet Blog](https://charm.sh/blog/) - Updates and tutorials
- [VHS Discussions](https://github.com/charmbracelet/vhs/discussions) - Community Q&A
- [VHS Issues](https://github.com/charmbracelet/vhs/issues) - Bug reports and feature requests

### Related Tools
- [Charm](https://charm.sh/) - Parent organization
- [Glow](https://github.com/charmbracelet/glow) - Markdown renderer (featured in examples)
- [Gum](https://github.com/charmbracelet/gum) - Shell scripting components (featured in examples)
- [Bubble Tea](https://github.com/charmbracelet/bubbletea) - TUI framework

## Next Steps

1. ✅ Complete this documentation
2. Install VHS and dependencies locally
3. Create `demos/` directory structure
4. Write first demo tape file (basic execution)
5. Test demo generation locally
6. Set up GitHub Action for automated regeneration
7. Create remaining demo tapes (agent details, multi-phase, errors)
8. Embed demos in README and docs
