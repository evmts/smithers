# 01_taro_hello.tape
# Purpose: JSX workflow you can review + state persisted under .smithers/

Output 01_taro_hello.gif

Require bash
Require gum

Set Shell bash
Set Theme "Catppuccin Frappe"
Set FontFamily "JetBrains Mono"
Set FontSize 22
Set Width 1200
Set Height 675
Set Padding 20
Set BorderRadius 12
Set WindowBar Rings
Set Framerate 30
Set TypingSpeed 35ms

Type "gum style --border double --align center --width 64 --padding '1 2' 'SMITHERS' 'Durable JSX workflows for coding agents'"
Enter
Sleep 700ms

Type "mkdir -p _vhs_smithers && cd _vhs_smithers"
Enter
Type "rm -rf 01_taro_hello && mkdir 01_taro_hello && cd 01_taro_hello"
Enter
Sleep 300ms

Type "gum style --border normal --padding '0 1' 'hello.tsx (JSX workflow)'"
Enter
Sleep 200ms

Type "cat > hello.tsx <<'EOF'"
Enter
Type "#!/usr/bin/env bun"
Enter
Type "import { createSmithersRoot, createSmithersDB, SmithersProvider, Claude } from \"smithers-orchestrator\";"
Enter
Enter
Type "const db = createSmithersDB({ path: \".smithers/hello\" });"
Enter
Type "const executionId = db.execution.start(\"Hello\", \"hello.tsx\");"
Enter
Enter
Type "async function Hello() {"
Enter
Type "  return ("
Enter
Type "    <SmithersProvider db={db} executionId={executionId} maxIterations={3}>"
Enter
Type "      <Claude model=\"haiku\" maxTurns={1} onFinished={(r) => console.log(r.output)}>"
Enter
Type "        Say \"Hello from Smithers!\""
Enter
Type "      </Claude>"
Enter
Type "    </SmithersProvider>"
Enter
Type "  );"
Enter
Type "}"
Enter
Enter
Type "const root = createSmithersRoot();"
Enter
Type "await root.mount(Hello);"
Enter
Type "db.close();"
Enter
Type "EOF"
Enter
Sleep 300ms

Type "sed -n '1,18p' hello.tsx"
Enter
Sleep 1000ms

Type "gum style --border normal --padding '0 1' 'Run (Bun + Claude Code CLI):'"
Enter
Sleep 250ms

Type "# bun hello.tsx"
Enter
Sleep 350ms
Type "gum spin --spinner dot --title 'Brewing workflow...' -- sleep 1"
Enter
Type "echo 'Success! Hello from Smithers!'"
Enter
Sleep 600ms

Type "mkdir -p .smithers/hello && touch .smithers/hello/execution.sqlite"
Enter
Type "ls -la .smithers/hello"
Enter
Sleep 900ms

Type "gum style --border double --align center --width 64 --padding '1 2' 'State persisted in SQLite.' 'Docs: https://smithers.sh'"
Enter
Sleep 1100ms
