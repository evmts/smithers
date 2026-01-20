# 08_honeydew_subagents.tape
# Purpose: show nested orchestration (Smithers inside Worktree) with a captured plan.

Output "08_honeydew_subagents.gif"

Require bash
Require gum

Set Shell "bash"
Set Theme "Catppuccin Frappe"
Set FontFamily "JetBrains Mono"
Set FontSize 22
Set Width 1200
Set Height 675
Set Padding 20
Set BorderRadius 12
Set WindowBar Rings
Set Framerate 30
Set TypingSpeed 35ms

Hide
Type "mkdir -p _vhs_smithers && cd _vhs_smithers"
Enter
Type "rm -rf 08_honeydew_subagents && mkdir 08_honeydew_subagents && cd 08_honeydew_subagents"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 68 --padding '1 2' 'HONEYDEW' 'Nested Smithers: planner + executor in an isolated worktree'"
Enter
Sleep 800ms

Type "cat > subagent.tsx <<'EOF'"
Enter
Type "import { Worktree, Smithers } from 'smithers-orchestrator';"
Enter
Enter
Type "<Worktree branch='complex-feature' base='main'>"
Enter
Type "  <Smithers plannerModel='opus'>"
Enter
Type "    Plan and implement a complex multi-phase feature with full isolation."
Enter
Type "  </Smithers>"
Enter
Type "</Worktree>"
Enter
Type "EOF"
Enter
Sleep 300ms

Type "sed -n '1,12p' subagent.tsx"
Enter
Sleep 900ms

Type "mkdir -p .scripts"
Enter
Type "cat > .scripts/plan.js <<'EOF'"
Enter
Type "// (generated) plan captured for auditability"
Enter
Type "console.log('1) Inspect repo');"
Enter
Type "console.log('2) Make changes in worktree');"
Enter
Type "console.log('3) Run tests');"
Enter
Type "console.log('4) Open review gate');"
Enter
Type "EOF"
Enter
Sleep 200ms

Type "sed -n '1,8p' .scripts/plan.js"
Enter
Sleep 800ms

Type "gum style --border double --align center --width 68 --padding '1 2' 'Planning is persisted.' 'Execution is isolated.'"
Enter
Sleep 1100ms
