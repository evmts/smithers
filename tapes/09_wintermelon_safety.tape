# 09_wintermelon_safety.tape
# Purpose: show safety primitives: allowlists + permissionMode + review/human gates.

Output "09_wintermelon_safety.gif"

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
Type "rm -rf 09_wintermelon_safety && mkdir 09_wintermelon_safety && cd 09_wintermelon_safety"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 70 --padding '1 2' 'WINTERMELON' 'Safety: tool allowlists + permission gating + review checkpoints'"
Enter
Sleep 800ms

Type "cat > safety.tsx <<'EOF'"
Enter
Type "import { Claude } from 'smithers-orchestrator';"
Enter
Enter
Type "<Claude"
Enter
Type "  allowedTools={['Bash', 'Edit', 'Write']}"
Enter
Type "  permissionMode='confirm'"
Enter
Type "  acceptEdits={false}"
Enter
Type ">"
Enter
Type "  Analyze the repo, propose a patch, but do not apply edits without approval."
Enter
Type "</Claude>"
Enter
Type "EOF"
Enter
Sleep 300ms

Type "cat safety.tsx"
Enter
Sleep 1000ms

Type "gum style --border normal --padding '1 2' 'Patterns that scale:' '- isolate work in worktrees' '- use Review/Human gates' '- persist an audit trail in SQLite'"
Enter
Sleep 1000ms

Type "gum style --border double --align center --width 70 --padding '1 2' 'Automation you can trust is automation you can inspect.'"
Enter
Sleep 1100ms
