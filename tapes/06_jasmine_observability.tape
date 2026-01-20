# Smithers Observability Demo
Output "06_jasmine_observability.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "echo '# Query execution history with smithers db'"
Sleep 500ms
Enter
Sleep 500ms

Type "smithers db executions"
Sleep 500ms
Enter

Hide
Type "echo 'id        name         status     duration'"
Enter
Type "echo '--------  -----------  ---------  --------'"
Enter
Type "echo 'e_01      PR Review    completed  42s'"
Enter
Type "echo 'e_02      CI Recovery  running    3m'"
Enter
Show
Sleep 2s

Type "smithers db phases --execution e_02"
Sleep 500ms
Enter

Hide
Type "echo 'phase       iterations  status'"
Enter
Type "echo '----------  ----------  -------'"
Enter
Type "echo 'implement   2           done'"
Enter
Type "echo 'test        2           done'"
Enter
Type "echo 'review      0           pending'"
Enter
Show
Sleep 2s

Type "smithers db tasks --execution e_02"
Sleep 500ms
Enter

Hide
Type "echo 'id       description'"
Enter
Type "echo '-------  -------------------'"
Enter
Type "echo 'task_17  Run tests'"
Enter
Type "echo 'task_18  Fix failing test'"
Enter
Show
Sleep 2s
