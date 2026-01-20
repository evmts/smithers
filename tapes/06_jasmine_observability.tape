# 06_jasmine_observability.tape
# Purpose: emphasize queryable history (executions/phases/tasks/transitions).

Output 06_jasmine_observability.gif

Require bash
Require gum

Set Shell bash
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

Type "gum style --border double --align center --width 68 --padding '1 2' 'JASMINE' 'Observability: inspect executions, phases, steps, tasks'"
Enter
Sleep 800ms

Type "mkdir -p _vhs_smithers && cd _vhs_smithers"
Enter
Type "rm -rf 06_jasmine_observability && mkdir 06_jasmine_observability && cd 06_jasmine_observability"
Enter
Sleep 300ms

Type "gum style --border normal --padding '0 1' 'Smithers CLI (examples):'"
Enter
Sleep 250ms

Type "cat > commands.txt <<'EOF'"
Enter
Type "smithers db executions"
Enter
Type "smithers db phases"
Enter
Type "smithers db tasks"
Enter
Type "smithers db transitions"
Enter
Type "smithers db export --execution-id <id>"
Enter
Type "EOF"
Enter
Type "cat commands.txt"
Enter
Sleep 900ms

Type "gum style --border normal --padding '0 1' 'Representative output:'"
Enter
Sleep 250ms

Type "cat > db-output.txt <<'EOF'"
Enter
Type "Executions"
Enter
Type "  e_01  PR Review      completed  duration=42s  stopReason=completed"
Enter
Type "  e_02  CI Recovery    running    duration=3m   stopReason=none"
Enter
Type ""
Enter
Type "Phases (e_02)"
Enter
Type "  implement  iterations=2"
Enter
Type "  test       iterations=2"
Enter
Type "  review     pending"
Enter
Type ""
Enter
Type "Tasks (e_02)"
Enter
Type "  task_17  Run tests"
Enter
Type "  task_18  Fix failing test"
Enter
Type "EOF"
Enter
Type "cat db-output.txt"
Enter
Sleep 1300ms

Type "gum style --border double --align center --width 68 --padding '1 2' 'Treat agent runs like systems: measure, inspect, replay.'"
Enter
Sleep 1100ms
