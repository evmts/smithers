# Demo 3: Agent Detail View
# Shows entering agent detail view to see prompt and output

Output demos/03-agent-details.gif

Set FontSize 14
Set Width 1400
Set Height 1000
Set Theme "Tokyo Night"
Set TypingSpeed 50ms

# Start execution with a more complex example
Type "smithers run examples/feature-workflow/agent.tsx --tui --mock"
Enter

# Wait for TUI to load
Sleep 2s

# Navigate to a Claude agent node
Down
Down
Down
Sleep 500ms

# Open detail view (Enter key)
Enter
Sleep 1s

# Scroll through the output
Down
Down
Down
Sleep 800ms
Down
Down
Sleep 800ms

# Scroll more to show scrolling works
PageDown
Sleep 1s

# Return to tree view (Escape)
Escape
Sleep 1s

# Navigate to another node
Down
Down
Sleep 500ms

# View that agent's details
Enter
Sleep 2s

# Go back
Escape
Sleep 500ms

# Quit
Type "q"
Sleep 500ms
