# Smithers Subagents Demo
Output "08_honeydew_subagents.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf subagent_demo && mkdir subagent_demo && cd subagent_demo"
Enter
Type "cat > subagent.tsx << 'EOF'"
Enter
Type "import { Worktree, Smithers } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "// Nested orchestration: planner + executor in isolated worktree"
Enter
Type "<Worktree branch='complex-feature' base='main'>"
Enter
Type "  <Smithers plannerModel='opus'>"
Enter
Type "    Plan and implement a complex multi-phase feature."
Enter
Type "  </Smithers>"
Enter
Type "</Worktree>"
Enter
Type "EOF"
Enter
Show

Type "echo '# Nested Smithers: planner + executor in isolated worktree'"
Sleep 500ms
Enter
Sleep 500ms

Type "cat subagent.tsx"
Sleep 500ms
Enter
Sleep 2s

Type "echo '# The planner generates a persisted plan:'"
Enter
Sleep 500ms

Type "echo '1) Inspect repository structure'"
Enter
Type "echo '2) Make changes in worktree'"
Enter
Type "echo '3) Run tests'"
Enter
Type "echo '4) Open review gate'"
Enter
Sleep 2s
