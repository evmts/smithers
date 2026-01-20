# Smithers VCS Primitives Demo
Output "05_oolong_vcs_primitives.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# Agent makes changes and commits with audit trail"
Sleep 500ms
Enter
Sleep 500ms

Type "git add -A && git commit -m 'feat: add user auth'"
Sleep 500ms
Enter

Hide
Type "echo '[main abc1234] feat: add user auth'"
Enter
Type "echo ' 3 files changed, 142 insertions(+)'"
Enter
Show
Sleep 1s

Type "# Smithers adds execution metadata via git notes"
Sleep 500ms
Enter
Sleep 500ms

Type "git notes add -m 'smithers: executionId=e_42 model=sonnet phase=implement'"
Sleep 500ms
Enter
Sleep 500ms

Type "git log -1 --oneline"
Sleep 500ms
Enter

Hide
Type "echo 'abc1234 feat: add user auth'"
Enter
Show
Sleep 1s

Type "git notes show HEAD"
Sleep 500ms
Enter

Hide
Type "echo 'smithers: executionId=e_42 model=sonnet phase=implement'"
Enter
Show
Sleep 2s
