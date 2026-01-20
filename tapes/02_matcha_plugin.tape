# Smithers Plugin Install Demo
Output "02_matcha_plugin.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# In Claude Code, install the plugin:"
Sleep 500ms
Enter
Sleep 500ms

Type "/plugin add evmts/smithers"
Sleep 500ms
Enter

Hide
Type "echo '✓ Installed smithers plugin'"
Enter
Show
Sleep 1s

Type "# Then ask Claude to generate a workflow:"
Sleep 500ms
Enter
Sleep 500ms

Type "# You: Create a workflow that reviews PRs"
Sleep 500ms
Enter
Sleep 500ms

Type "# Claude: I'll create a PR review workflow..."
Sleep 500ms
Enter
Sleep 1s

Type "cat pr-review-workflow.tsx"
Sleep 500ms
Enter

Hide
Type "cat << 'EOF'"
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
Type "      <Phase name='review'>"
Enter
Type "        <Step name='read'><Claude>Read the PR diff</Claude></Step>"
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
Sleep 3s
