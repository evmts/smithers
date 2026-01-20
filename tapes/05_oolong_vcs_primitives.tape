# Smithers VCS Primitives Demo
Output "05_oolong_vcs_primitives.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf vcs_demo && mkdir vcs_demo && cd vcs_demo"
Enter
Type "git init -q && echo 'v1' > app.txt && git add . && git commit -qm 'init'"
Enter
Show

Type "echo '# Agent makes changes and commits'"
Sleep 500ms
Enter

Type "echo 'v2' >> app.txt"
Sleep 500ms
Enter

Type "git add app.txt"
Sleep 500ms
Enter

Type "git commit -m 'feat: update app'"
Sleep 500ms
Enter
Sleep 1s

Type "echo '# Add audit metadata via git notes'"
Enter

Type "git notes add -m 'smithers: executionId=e_01 model=sonnet'"
Sleep 500ms
Enter
Sleep 1s

Type "git log -1 --oneline"
Sleep 500ms
Enter
Sleep 1s

Type "git notes show HEAD"
Sleep 500ms
Enter
Sleep 2s
