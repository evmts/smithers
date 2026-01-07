# Demo 1: Basic TUI Execution
# Shows basic smithers run command with TUI

Output demos/01-basic-execution.gif

Set FontSize 16
Set Width 1200
Set Height 800
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# Show the command
Type "smithers run examples/01-hello-world/agent.tsx --tui --mock"
Enter

# Wait for TUI to appear
Sleep 2s

# Navigate down in tree
Down
Sleep 500ms
Down
Sleep 500ms

# Expand a node
Right
Sleep 1s

# Wait for execution to progress
Sleep 3s

# Quit
Type "q"
Sleep 500ms
