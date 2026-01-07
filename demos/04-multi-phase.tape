# Demo 4: Multi-Phase Workflow
# Shows complex multi-phase execution with state transitions

Output demos/04-multi-phase.gif

Set FontSize 16
Set Width 1300
Set Height 900
Set Theme "Nord"
Set TypingSpeed 50ms

# Run multi-phase example
Type "smithers run examples/00-feature-workflow/agent.tsx --tui --mock"
Enter

# Wait for TUI to appear
Sleep 2s

# Show the tree structure with phases
Down
Sleep 400ms
Down
Sleep 400ms

# Expand first phase to show its agents
Right
Sleep 1s

# Navigate into the phase
Down
Sleep 400ms
Down
Sleep 400ms

# Collapse and move to next phase
Up
Up
Left
Sleep 800ms

# Move to second phase
Down
Down
Sleep 400ms

# Expand second phase
Right
Sleep 1s

# Show agents executing
Down
Sleep 400ms

# Wait a bit to show execution progress
Sleep 2s

# Navigate to later phase
Down
Down
Down
Sleep 400ms

# Expand to show nested structure
Right
Sleep 1s
Down
Sleep 400ms

# Show final state
Sleep 2s

# Quit
Type "q"
Sleep 500ms
