# Claude Code Guidelines

## Git Commit Convention

Every commit MUST have a git note attached containing comprehensive context from the conversation that led to the commit. This should include:

- Near-verbatim chat history leading to the commit
- Design decisions and reasoning discussed
- User requirements and constraints mentioned
- Any alternatives considered and why they were rejected

### How to add git notes

```bash
# After committing
git notes add -m "$(cat <<'EOF'
[Full conversation context here]
EOF
)"

# View notes
git log --show-notes
```

### Why we do this

- Preserves the "why" behind every change
- Makes it possible to understand design decisions months later
- Creates a searchable history of product decisions
- Helps onboard new contributors with full context

## Post-Commit Hook

A Codex review hook runs after each commit. It:
- Reviews the commit with Codex
- Only saves reviews with actionable feedback (skips LGTM)
- Saves reviews to `reviews/` directory
- Auto-commits the review

To install hook on clone:
```bash
cp hooks/post-commit .git/hooks/
chmod +x .git/hooks/post-commit
```
