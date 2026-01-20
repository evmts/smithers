# Smithers Subagents Demo
Output "08_honeydew_subagents.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# Nested Smithers: planner + executor in isolated worktree"
Sleep 500ms
Enter
Sleep 500ms

Type "cat subagent.tsx"
Sleep 500ms
Enter

Hide
Type "cat << 'EOF'"
Enter
Type "import { Worktree, Smithers } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "// Planner generates a script, executor runs it"
Enter
Type "<Worktree branch='complex-feature' base='main'>"
Enter
Type "  <Smithers plannerModel='opus' executionModel='sonnet'>"
Enter
Type "    Implement multi-phase payment processing."
Enter
Type "  </Smithers>"
Enter
Type "</Worktree>"
Enter
Type "EOF"
Enter
Show
Sleep 2s

Type "bun subagent.tsx"
Sleep 500ms
Enter

Hide
Type "echo '[smithers] Creating worktree: complex-feature'"
Enter
Type "echo '[planner:opus] Generating execution plan...'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[planner:opus] Plan: 4 phases, 12 steps'"
Enter
Type "echo '[executor:sonnet] Phase 1: Schema design'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[executor:sonnet] Phase 2: API implementation'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[executor:sonnet] Phase 3: Tests'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[executor:sonnet] Phase 4: Documentation'"
Enter
Type "echo '[smithers] Subagent complete'"
Enter
Show
Sleep 2s
