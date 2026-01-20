# Smithers Safety Demo
Output "09_wintermelon_safety.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf safety_demo && mkdir safety_demo && cd safety_demo"
Enter
Type "cat > safety.tsx << 'EOF'"
Enter
Type "import { Claude } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "<Claude"
Enter
Type "  allowedTools={['Bash', 'Edit', 'Write']}"
Enter
Type "  permissionMode='confirm'"
Enter
Type "  acceptEdits={false}"
Enter
Type ">"
Enter
Type "  Analyze the repo and propose a patch."
Enter
Type "  Do not apply edits without approval."
Enter
Type "</Claude>"
Enter
Type "EOF"
Enter
Show

Type "echo '# Safety props: allowedTools, permissionMode, acceptEdits'"
Sleep 500ms
Enter
Sleep 500ms

Type "cat safety.tsx"
Sleep 500ms
Enter
Sleep 2s

Type "echo '# Safety patterns:'"
Enter
Type "echo '  - allowedTools: restrict which tools agent can use'"
Enter
Type "echo '  - permissionMode: require confirmation for actions'"
Enter
Type "echo '  - acceptEdits: control whether edits auto-apply'"
Enter
Type "echo '  - Review gates: human checkpoints in workflow'"
Enter
Sleep 3s
