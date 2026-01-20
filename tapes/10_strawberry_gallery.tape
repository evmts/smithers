# 10_strawberry_gallery.tape
# Purpose: a "menu GIF" you can pin in README, docs, or X thread.

Output "10_strawberry_gallery.gif"

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
Type "rm -rf 10_strawberry_gallery && mkdir 10_strawberry_gallery && cd 10_strawberry_gallery"
Enter
Sleep 300ms
Show

Type "gum style --border double --align center --width 68 --padding '1 2' 'STRAWBERRY' 'Pick a workflow. Run. Verify. Iterate.'"
Enter
Sleep 800ms

Type "gum style --border normal --padding '1 2' 'Examples you can start from:'"
Enter
Sleep 250ms

Type "cat > menu.txt <<'EOF'"
Enter
Type "1) Hello World (smallest runnable workflow)"
Enter
Type "2) Multi-Phase Review (implement -> review -> commit)"
Enter
Type "3) Structured Output (Zod schema + retries)"
Enter
Type "4) Worktrees (parallel branches)"
Enter
Type "5) Subagents (planner + executor)"
Enter
Type "6) Kitchen Sink (all primitives together)"
Enter
Type "EOF"
Enter
Type "cat menu.txt"
Enter
Sleep 1100ms

Type "gum style --border normal --padding '1 2' 'Fastest onboarding:' '/plugin marketplace add evmts/smithers' '/plugin install smithers@smithers'"
Enter
Sleep 900ms

Type "gum style --border double --align center --width 68 --padding '1 2' 'Docs: https://smithers.sh' 'Make agentic automation restart-proof.'"
Enter
Sleep 1200ms
