# Smithers Worktrees Demo
Output "04_thai_tea_worktrees.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# Create isolated worktrees for parallel agent work"
Sleep 500ms
Enter
Sleep 500ms

Type "git worktree add -b feature-auth .worktrees/feature-auth"
Sleep 500ms
Enter

Hide
Type "echo 'Preparing worktree (new branch feature-auth)'"
Enter
Type "echo 'HEAD is now at abc1234 init'"
Enter
Show
Sleep 1s

Type "git worktree add -b feature-api .worktrees/feature-api"
Sleep 500ms
Enter

Hide
Type "echo 'Preparing worktree (new branch feature-api)'"
Enter
Type "echo 'HEAD is now at abc1234 init'"
Enter
Show
Sleep 1s

Type "git worktree list"
Sleep 500ms
Enter

Hide
Type "echo '/project              abc1234 [main]'"
Enter
Type "echo '/project/.worktrees/feature-auth  abc1234 [feature-auth]'"
Enter
Type "echo '/project/.worktrees/feature-api   abc1234 [feature-api]'"
Enter
Show
Sleep 2s

Type "# Each agent works in its own worktree - no conflicts"
Sleep 500ms
Enter
Sleep 2s
