# Smithers Worktrees Demo
Output "04_thai_tea_worktrees.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf worktree_demo && mkdir worktree_demo && cd worktree_demo"
Enter
Type "git init -q && echo 'base' > README.md && git add . && git commit -qm 'init'"
Enter
Show

Type "echo '# Create isolated worktrees for parallel work'"
Sleep 500ms
Enter

Type "mkdir -p .worktrees"
Sleep 500ms
Enter

Type "git worktree add -b feature-a .worktrees/feature-a"
Sleep 500ms
Enter
Sleep 500ms

Type "git worktree add -b feature-b .worktrees/feature-b"
Sleep 500ms
Enter
Sleep 500ms

Type "git worktree list"
Sleep 500ms
Enter
Sleep 2s

Type "echo '# Each agent works in its own worktree - no conflicts'"
Enter
Sleep 2s
