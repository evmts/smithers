# Demo 2: Tree Navigation
# Shows keyboard navigation through the TUI tree

Output demos/02-tree-navigation.gif

Set FontSize 16
Set Width 1200
Set Height 800
Set Theme "Dracula"
Set TypingSpeed 50ms

# Run a multi-level example
Type "smithers run examples/00-feature-workflow/agent.tsx --tui --mock"
Enter

# Wait for TUI to appear
Sleep 2s

# Navigate through tree nodes
Down
Sleep 300ms
Down
Sleep 300ms
Down
Sleep 300ms

# Expand a node to show children
Right
Sleep 800ms

# Navigate into expanded node
Down
Sleep 300ms

# Collapse node
Left
Sleep 800ms

# Move back up
Up
Sleep 300ms
Up
Sleep 300ms

# Expand again
Right
Sleep 1s

# Wait to show final state
Sleep 2s

# Quit
Type "q"
Sleep 500ms
