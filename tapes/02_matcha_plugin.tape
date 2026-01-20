# Smithers Plugin Install Demo
Output "02_matcha_plugin.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf matcha_demo && mkdir matcha_demo && cd matcha_demo"
Enter
Type "cat > pr-review-workflow.tsx << 'EOF'"
Enter
Type "#!/usr/bin/env bun"
Enter
Type "import { createSmithersRoot, createSmithersDB, SmithersProvider, Phase, Step, Review, Claude } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "const db = createSmithersDB({ path: '.smithers/pr-review' })"
Enter
Type "const executionId = db.execution.start('PR Review', 'pr-review-workflow.tsx')"
Enter
Type ""
Enter
Type "function Workflow() {"
Enter
Type "  return ("
Enter
Type "    <SmithersProvider db={db} executionId={executionId}>"
Enter
Type "      <Phase name='Review PR'>"
Enter
Type "        <Step name='read'><Claude>Read the PR</Claude></Step>"
Enter
Type "        <Step name='gate'><Review criteria={['Correctness','Safety']} /></Step>"
Enter
Type "        <Step name='comment'><Claude>Write review comments</Claude></Step>"
Enter
Type "      </Phase>"
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
Type "await root.mount(Workflow)"
Enter
Type "EOF"
Enter
Show

Type "echo '# In Claude Code:'"
Sleep 500ms
Enter
Type "echo '/plugin marketplace add evmts/smithers'"
Enter
Type "echo '/plugin install smithers@smithers'"
Enter
Sleep 1s

Type "echo ''"
Enter
Type "echo '# You: Create a workflow that reviews PRs'"
Enter
Type "echo '# Claude: generated pr-review-workflow.tsx'"
Enter
Sleep 1s

Type "cat pr-review-workflow.tsx"
Sleep 500ms
Enter
Sleep 3s
