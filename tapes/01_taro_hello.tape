# Smithers Hello World Demo
Output "01_taro_hello.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf taro_demo && mkdir taro_demo && cd taro_demo"
Enter
Type "cat > hello.tsx << 'EOF'"
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
Type "mkdir -p .smithers/hello && touch .smithers/hello/execution.sqlite"
Enter
Show

Type "cat hello.tsx"
Sleep 500ms
Enter
Sleep 2s

Type "bun hello.tsx"
Sleep 500ms
Enter

Hide
Type "echo 'Hello from Smithers!'"
Enter
Show
Sleep 2s

Type "ls .smithers/hello/"
Sleep 500ms
Enter
Sleep 2s
