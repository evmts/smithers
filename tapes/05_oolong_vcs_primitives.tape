# 05_oolong_vcs_primitives.tape
# Purpose: show VCS primitives and an audit trail via notes.

Output "05_oolong_vcs_primitives.gif"

Require bash
Require gum
Require git

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
Type "rm -rf 05_oolong_vcs_primitives && mkdir 05_oolong_vcs_primitives && cd 05_oolong_vcs_primitives"
Enter
Sleep 300ms
Type "git init -q"
Enter
Type "echo 'v1' > app.txt"
Enter
Type "git add app.txt"
Enter
Type "git commit -qm 'chore: init'"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 66 --padding '1 2' 'OOLONG' 'Repo-native primitives: commits + notes + review gates'"
Enter
Sleep 800ms

Type "echo 'v2' >> app.txt"
Enter
Type "git add app.txt"
Enter
Type "git commit -qm 'feat: update app'"
Enter
Sleep 300ms

Type "git notes add -m 'smithers: executionId=e_01 model=sonnet prompt=update app'"
Enter
Sleep 200ms

Type "git log -1 --oneline"
Enter
Sleep 800ms

Type "git notes show HEAD"
Enter
Sleep 900ms

Type "gum style --border normal --padding '0 1' 'In Smithers, commits + notes are first-class:'"
Enter
Sleep 250ms

Type "cat > vcs-snippet.tsx <<'EOF'"
Enter
Type "import { Commit } from 'smithers-orchestrator';"
Enter
Enter
Type "<Commit"
Enter
Type "  message='feat: Add user authentication'"
Enter
Type "  all"
Enter
Type "  notes={{ smithers: true, prompt: 'Add auth' }}"
Enter
Type "  onFinished={(result) => {"
Enter
Type "    console.log('Committed: ' + result.commitHash);"
Enter
Type "  }}"
Enter
Type "/>"
Enter
Type "EOF"
Enter
Sleep 200ms

Type "cat vcs-snippet.tsx"
Enter
Sleep 1100ms

Type "gum style --border double --align center --width 66 --padding '1 2' 'Automation that leaves an audit trail.'"
Enter
Sleep 1100ms
