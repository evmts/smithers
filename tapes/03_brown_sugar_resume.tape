# Smithers Resume Demo
Output "03_brown_sugar_resume.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf resume_demo && mkdir resume_demo && cd resume_demo"
Enter
Type "mkdir -p .smithers/ci-recovery && touch .smithers/ci-recovery/execution.sqlite"
Enter
Show

Type "echo '# Start a long-running workflow'"
Sleep 500ms
Enter

Type "bun ci-recovery.tsx"
Sleep 500ms
Enter

Hide
Type "echo '[iteration 1] running tests...'"
Enter
Type "sleep 0.5 && echo '[iteration 2] running tests...'"
Enter
Type "sleep 0.5 && echo '[iteration 3] running tests...'"
Enter
Show
Sleep 2s

Type@0ms ""
Ctrl+C
Sleep 500ms

Type "echo '# Process interrupted! But state persists in SQLite'"
Enter
Sleep 1s

Type "ls .smithers/ci-recovery/"
Sleep 500ms
Enter
Sleep 1s

Type "echo '# Resume from where we left off'"
Enter
Type "bun ci-recovery.tsx"
Sleep 500ms
Enter

Hide
Type "echo '[resumed] continuing at iteration 3'"
Enter
Type "echo '[iteration 3] tests passed!'"
Enter
Show
Sleep 2s
