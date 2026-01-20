# Smithers Observability Demo
Output "06_jasmine_observability.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# Query execution history from SQLite"
Sleep 500ms
Enter
Sleep 500ms

Type "smithers db executions"
Sleep 500ms
Enter

Hide
Type "echo 'ID       NAME          STATUS     DURATION'"
Enter
Type "echo '──────── ───────────── ────────── ────────'"
Enter
Type "echo 'e_41     PR Review     completed  42s'"
Enter
Type "echo 'e_42     CI Recovery   running    3m 12s'"
Enter
Type "echo 'e_43     Night Shift   pending    -'"
Enter
Show
Sleep 2s

Type "smithers db state --execution e_42"
Sleep 500ms
Enter

Hide
Type "echo 'KEY            VALUE'"
Enter
Type "echo '────────────── ─────────────────'"
Enter
Type "echo 'phase          implement'"
Enter
Type "echo 'iteration      3'"
Enter
Type "echo 'tests_passed   false'"
Enter
Type "echo 'last_error     auth_test.ts:42'"
Enter
Show
Sleep 2s

Type "smithers db stats"
Sleep 500ms
Enter

Hide
Type "echo 'Executions: 43  |  Agents: 127  |  Tasks: 891'"
Enter
Type "echo 'DB size: 2.4 MB  |  Uptime: 14d'"
Enter
Show
Sleep 2s
