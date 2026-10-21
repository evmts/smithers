---
"@smthrs/sync": minor
---

Adds `SharedText.mark(name, value)` and `SharedText.marks`: small named strings beside a shared text that every replica
agrees on, carried in the same updates and never changing the text. A shared file's Save marks the digest of what it
wrote, so every editor, not only the one that saved, can say whether its text is saved.
