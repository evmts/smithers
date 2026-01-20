# 04_thai_tea_worktrees.tape
# Purpose: show worktree isolation and parallel branch execution.

Output 04_thai_tea_worktrees.gif

Require bash
Require gum
Require git

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

Type "gum style --border double --align center --width 64 --padding '1 2' 'THAI TEA' 'Worktrees: safe parallelism by default'"
Enter
Sleep 800ms

Type "mkdir -p _vhs_smithers && cd _vhs_smithers"
Enter
Type "rm -rf 04_thai_tea_worktrees && mkdir 04_thai_tea_worktrees && cd 04_thai_tea_worktrees"
Enter
Sleep 300ms

Type "git init -q"
Enter
Type "echo 'base' > README.md"
Enter
Type "git add README.md"
Enter
Type "git commit -qm 'chore: init'"
Enter
Sleep 400ms

Type "mkdir -p .worktrees"
Enter
Type "git worktree add -b feature-a .worktrees/feature-a"
Enter
Type "git worktree add -b feature-b .worktrees/feature-b"
Enter
Sleep 500ms

Type "git worktree list"
Enter
Sleep 1000ms

Type "ls -la .worktrees"
Enter
Sleep 700ms

Type "gum style --border normal --padding '0 1' 'Smithers Worktree component looks like:'"
Enter
Sleep 250ms

Type "cat > worktree-snippet.tsx <<'EOF'"
Enter
Type "import { Worktree, Phase, Step, Claude } from \"smithers-orchestrator\";"
Enter
Enter
Type "<>"
Enter
Type "  <Worktree branch=\"feature-a\" cleanup>"
Enter
Type "    <Phase name=\"Feature A\">"
Enter
Type "      <Step name=\"implement\">"
Enter
Type "        <Claude>Implement feature A independently</Claude>"
Enter
Type "      </Step>"
Enter
Type "    </Phase>"
Enter
Type "  </Worktree>"
Enter
Type "  <Worktree branch=\"feature-b\" cleanup>"
Enter
Type "    <Phase name=\"Feature B\">"
Enter
Type "      <Step name=\"implement\">"
Enter
Type "        <Claude>Implement feature B in parallel</Claude>"
Enter
Type "      </Step>"
Enter
Type "    </Phase>"
Enter
Type "  </Worktree>"
Enter
Type "</>"
Enter
Type "EOF"
Enter
Sleep 200ms

Type "sed -n '1,22p' worktree-snippet.tsx"
Enter
Sleep 1100ms

Type "gum style --border double --align center --width 64 --padding '1 2' 'Parallel branches.' 'No collisions.'"
Enter
Sleep 1100ms
