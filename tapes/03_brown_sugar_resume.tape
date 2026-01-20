# Smithers Resume Demo
Output "03_brown_sugar_resume.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# Start a long-running CI recovery workflow"
Sleep 500ms
Enter
Sleep 500ms

Type "bun ci-recovery.tsx"
Sleep 500ms
Enter

Hide
Type "echo '[smithers] Starting execution e_42'"
Enter
Type "echo '[iteration 1] Running tests...'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[iteration 1] 2 tests failed'"
Enter
Type "echo '[claude] Fixing auth_test.ts...'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[iteration 2] Running tests...'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[iteration 2] 1 test failed'"
Enter
Type "echo '[claude] Fixing db_test.ts...'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[iteration 3] Running tests...'"
Enter
Show
Sleep 1s

Ctrl+C
Sleep 500ms

Type "# Process killed! But state persists in SQLite"
Sleep 500ms
Enter
Sleep 1s

Type "ls .smithers/ci-recovery/"
Sleep 500ms
Enter

Hide
Type "echo 'execution.sqlite'"
Enter
Show
Sleep 1s

Type "# Resume from where we left off"
Sleep 500ms
Enter
Sleep 500ms

Type "bun ci-recovery.tsx"
Sleep 500ms
Enter

Hide
Type "echo '[smithers] Resuming execution e_42 at iteration 3'"
Enter
Type "echo '[iteration 3] Running tests...'"
Enter
Type "sleep 0.3"
Enter
Type "echo '[iteration 3] All tests passed!'"
Enter
Type "echo '[smithers] Execution complete'"
Enter
Show
Sleep 2s
