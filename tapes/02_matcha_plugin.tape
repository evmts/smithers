# 02_matcha_plugin.tape
# Purpose: show the plugin wedge and a generated workflow file.

Output "02_matcha_plugin.gif"

Require bash
Require gum

Set Shell "bash"
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

Hide
Type "mkdir -p _vhs_smithers && cd _vhs_smithers"
Enter
Type "rm -rf 02_matcha_plugin && mkdir 02_matcha_plugin && cd 02_matcha_plugin"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 64 --padding '1 2' 'MATCHA MODE' 'Install Smithers as a Claude Code plugin'"
Enter
Sleep 700ms

Type "gum style --border normal --padding '1 2' 'In Claude Code:' '/plugin marketplace add evmts/smithers' '/plugin install smithers@smithers'"
Enter
Sleep 900ms

Type "gum style --border normal --padding '1 2' 'You: Create a workflow that reviews PRs' 'Claude: generated pr-review-workflow.tsx'"
Enter
Sleep 700ms

Type "cat > pr-review-workflow.tsx <<'EOF'"
Enter
Type "#!/usr/bin/env bun"
Enter
Type "import { createSmithersRoot, createSmithersDB, SmithersProvider, Phase, Step, Review, Claude } from 'smithers-orchestrator';"
Enter
Enter
Type "const db = createSmithersDB({ path: '.smithers/pr-review' });"
Enter
Type "const executionId = db.execution.start('PR Review', 'pr-review-workflow.tsx');"
Enter
Enter
Type "function Workflow() {"
Enter
Type "  return ("
Enter
Type "    <SmithersProvider db={db} executionId={executionId} maxIterations={10}>"
Enter
Type "      <Phase name='Review PR'>"
Enter
Type "        <Step name='read'>"
Enter
Type "          <Claude>Read the PR description and changed files</Claude>"
Enter
Type "        </Step>"
Enter
Type "        <Step name='gate'>"
Enter
Type "          <Review target={{ type: 'diff', ref: 'main' }} criteria={['Correctness','Safety','Tests']} />"
Enter
Type "        </Step>"
Enter
Type "        <Step name='comment'>"
Enter
Type "          <Claude>Write review comments with suggested fixes</Claude>"
Enter
Type "        </Step>"
Enter
Type "      </Phase>"
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
Type "await root.mount(Workflow);"
Enter
Type "db.close();"
Enter
Type "EOF"
Enter
Sleep 300ms

Type "ls"
Enter
Sleep 300ms

Type "sed -n '1,22p' pr-review-workflow.tsx"
Enter
Sleep 1200ms

Type "gum style --border double --align center --width 64 --padding '1 2' 'Agent-native authoring.' 'Workflows you can diff + review.'"
Enter
Sleep 1100ms
