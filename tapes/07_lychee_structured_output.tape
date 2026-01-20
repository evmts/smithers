# Smithers Structured Output Demo
Output "07_lychee_structured_output.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Hide
Type "cd /tmp && rm -rf structured_demo && mkdir structured_demo && cd structured_demo"
Enter
Type "cat > structured.tsx << 'EOF'"
Enter
Type "import { z } from 'zod'"
Enter
Type "import { Claude } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "const ReviewSummary = z.object({"
Enter
Type "  summary: z.string(),"
Enter
Type "  changedFiles: z.array(z.string()),"
Enter
Type "  risks: z.array(z.string()),"
Enter
Type "})"
Enter
Type ""
Enter
Type "<Claude"
Enter
Type "  schema={ReviewSummary}"
Enter
Type "  schemaRetries={2}"
Enter
Type "  onFinished={(r) => console.log(r.structuredOutput)}"
Enter
Type ">"
Enter
Type "  Summarize this PR for a reviewer."
Enter
Type "</Claude>"
Enter
Type "EOF"
Enter
Show

Type "echo '# Define a Zod schema for typed agent output'"
Sleep 500ms
Enter
Sleep 500ms

Type "cat structured.tsx"
Sleep 500ms
Enter
Sleep 2s

Type "echo '# Agent returns validated JSON:'"
Enter
Sleep 500ms

Hide
Type "cat << 'JSONEOF'"
Enter
Type "{"
Enter
Type "  summary: Adds resume-safe CI recovery,"
Enter
Type "  changedFiles: [ci-recovery.tsx],"
Enter
Type "  risks: [Modifies git state]"
Enter
Type "}"
Enter
Type "JSONEOF"
Enter
Show
Sleep 2s
