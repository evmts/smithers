# Code Reviews

Auto-generated code reviews from the post-commit hook.

## How This Works

When you make a commit, the `hooks/post-commit` hook:

1. Sends the commit diff to Codex for review
2. If Codex finds actionable feedback, saves it here
3. Auto-commits the review file

## Review Format

Each review file is named `{commit-hash}.md` and contains:

```markdown
# Review: abc1234

**Commit:** abc1234567890abcdef...
**Message:** Original commit message
**Date:** 2025-01-05 12:00:00 UTC

## Feedback

[Codex's feedback here]
```

## Why Reviews Exist

- **Learning:** See how an AI reviews your code
- **History:** Track feedback patterns over time
- **Quality:** Catch issues you might have missed

## What Gets Reviewed

All commits except:
- Review commits (prefixed with `review:`)
- Empty commits
- Merge commits (usually)

## What "LGTM" Means

If Codex finds no issues, it responds with "LGTM" (Looks Good To Me) and no review file is created. Only commits with actionable feedback get saved here.

## Cleaning Up

These files are auto-committed and can be safely deleted if you want to clean up:

```bash
# Remove all reviews
rm -f reviews/*.md

# Or keep recent, remove old
find reviews -name "*.md" -mtime +30 -delete
```

## Disabling Reviews

To stop generating reviews:

```bash
# Remove the hook
rm .git/hooks/post-commit

# Or skip for one commit
git commit --no-verify -m "message"
```

## See Also

- [hooks/README.md](../hooks/README.md) - Hook documentation
