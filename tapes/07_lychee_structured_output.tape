# Smithers Structured Output Demo
Output "07_lychee_structured_output.gif"

Set Shell "bash"
Set FontSize 18
Set Width 900
Set Height 500
Set TypingSpeed 50ms
Set Theme "Catppuccin Frappe"

Type "# Define Zod schema for typed agent output"
Sleep 500ms
Enter
Sleep 500ms

Type "cat structured.tsx"
Sleep 500ms
Enter

Hide
Type "cat << 'EOF'"
Enter
Type "import { z } from 'zod'"
Enter
Type "import { Claude } from 'smithers-orchestrator'"
Enter
Type ""
Enter
Type "const ReviewSchema = z.object({"
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
Type "  schema={ReviewSchema}"
Enter
Type "  onFinished={(r) => console.log(r.structuredOutput)}"
Enter
Type ">"
Enter
Type "  Summarize this PR for review."
Enter
Type "</Claude>"
Enter
Type "EOF"
Enter
Show
Sleep 2s

Type "bun structured.tsx"
Sleep 500ms
Enter

Hide
Type "cat << 'JSON'"
Enter
Type "{"
Enter
Type "  summary: Adds resume-safe CI recovery workflow,"
Enter
Type "  changedFiles: [ci-recovery.tsx, db.ts],"
Enter
Type "  risks: [Modifies git state, Requires API key]"
Enter
Type "}"
Enter
Type "JSON"
Enter
Show
Sleep 2s
