# 07_lychee_structured_output.tape
# Purpose: demonstrate typed JSON return values for workflows.

Output "07_lychee_structured_output.gif"

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
Type "rm -rf 07_lychee_structured_output && mkdir 07_lychee_structured_output && cd 07_lychee_structured_output"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 66 --padding '1 2' 'LYCHEE' 'Structured output: make agents return typed JSON'"
Enter
Sleep 800ms

Type "cat > structured.tsx <<'EOF'"
Enter
Type "import { z } from 'zod';"
Enter
Type "import { Claude } from 'smithers-orchestrator';"
Enter
Enter
Type "const ReviewSummary = z.object({"
Enter
Type "  summary: z.string(),"
Enter
Type "  changedFiles: z.array(z.string()),"
Enter
Type "  risks: z.array(z.string()),"
Enter
Type "});"
Enter
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
Sleep 300ms

Type "sed -n '1,22p' structured.tsx"
Enter
Sleep 900ms

Type "gum style --border normal --padding '0 1' 'Representative JSON:'"
Enter
Sleep 250ms

Type "cat > out.json <<'EOF'"
Enter
Type "{"
Enter
Type "  'summary': 'Adds a resume-safe CI recovery workflow.',"
Enter
Type "  'changedFiles': ['ci-recovery.tsx', 'README.md'],"
Enter
Type "  'risks': ['Potentially modifies git state', 'Runs commands']"
Enter
Type "}"
Enter
Type "EOF"
Enter
Type "cat out.json"
Enter
Sleep 1100ms

Type "gum style --border double --align center --width 66 --padding '1 2' 'Stop parsing strings. Start consuming structured results.'"
Enter
Sleep 1100ms
