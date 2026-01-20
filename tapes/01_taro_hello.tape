# Smithers Hello World Demo
Output "01_taro_hello.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "cat hello.tsx"
Sleep 500ms
Enter

Hide
Type "cat << 'EOF'"
Enter
Type "#!/usr/bin/env bun"
Enter
Type "import { createSmithersRoot, createSmithersDB, SmithersProvider, Claude } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "const db = createSmithersDB({ path: '.smithers/hello' })"
Enter
Type "const executionId = db.execution.start('Hello', 'hello.tsx')"
Enter
Type ""
Enter
Type "function Hello() {"
Enter
Type "  return ("
Enter
Type "    <SmithersProvider db={db} executionId={executionId}>"
Enter
Type "      <Claude>Say hello from Smithers!</Claude>"
Enter
Type "    </SmithersProvider>"
Enter
Type "  )"
Enter
Type "}"
Enter
Type ""
Enter
Type "const root = createSmithersRoot()"
Enter
Type "await root.mount(Hello)"
Enter
Type "db.close()"
Enter
Type "EOF"
Enter
Show
Sleep 2s

Type "bun hello.tsx"
Sleep 500ms
Enter

Hide
Type "echo '[smithers] Starting execution e_01'"
Enter
Type "echo '[claude] Say hello from Smithers!'"
Enter
Type "echo ''"
Enter
Type "echo 'Hello from Smithers! 👋'"
Enter
Type "echo ''"
Enter
Type "echo '[smithers] Execution complete'"
Enter
Show
Sleep 2s

Type "ls .smithers/hello/"
Sleep 500ms
Enter

Hide
Type "echo 'execution.sqlite'"
Enter
Show
Sleep 1s
