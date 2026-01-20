# 03_brown_sugar_resume.tape
# Purpose: show the restart-proof loop narrative + inspectability.

Output "03_brown_sugar_resume.gif"

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
Type "rm -rf 03_brown_sugar_resume && mkdir 03_brown_sugar_resume && cd 03_brown_sugar_resume"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 66 --padding '1 2' 'BROWN SUGAR' 'Durable Ralphing: run -> verify -> iterate (and resume)'"
Enter
Sleep 800ms

Type "gum style --border normal --padding '1 2' 'A long-running loop needs:' '- persistence' '- stop / restart' '- audit trail'"
Enter
Sleep 900ms

Type "mkdir -p .smithers/ci-recovery && touch .smithers/ci-recovery/execution.sqlite"
Enter
Sleep 200ms

Type "gum style --border normal --padding '0 1' 'Simulated CI recovery loop:'"
Enter
Sleep 200ms

Type "for i in 1 2 3; do echo '[iteration' \$i'] run tests'; sleep 0.3; echo '[iteration' \$i'] verify'; sleep 0.3; echo '[iteration' \$i'] apply fix'; sleep 0.3; done"
Enter
Sleep 3000ms

Type "echo '[stopped] process exited, but state is still in .smithers/ci-recovery'"
Enter
Sleep 600ms

Type "gum style --border normal --padding '0 1' 'Restart:'"
Enter
Sleep 200ms
Type "# bun ci-recovery.tsx"
Enter
Sleep 250ms
Type "gum spin --spinner dot --title 'Resuming from SQLite...' -- sleep 1"
Enter
Type "echo '[resumed] continuing at iteration 3'"
Enter
Sleep 700ms

Type "gum style --border normal --padding '0 1' 'Inspect the flight recorder:'"
Enter
Sleep 200ms
Type "# smithers db executions"
Enter
Sleep 200ms

Type "cat > executions.txt <<'EOF'"
Enter
Type "id        name         status     started_at"
Enter
Type "--------  -----------  ---------  ---------------------"
Enter
Type "e_01      CI Recovery   running    2026-01-20T12:34:56Z"
Enter
Type "EOF"
Enter
Type "cat executions.txt"
Enter
Sleep 1100ms

Type "gum style --border double --align center --width 66 --padding '1 2' 'Resume mid-flight.' 'Debug with a DB, not a hunch.'"
Enter
Sleep 1100ms
