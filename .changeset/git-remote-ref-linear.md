---
"@smthrs/effect-code-storage": minor
---

`GitRemote.ref` reads an `ls-refs` answer one packet at a time as it arrives
and stops at the branch's line or at the flush. It used to re-read everything
it had received on every chunk, so a remote listing thousands of pull request
refs cost time quadratic in the answer: about three minutes of CPU to reach the
1 MiB cap. That cap is now reached in milliseconds.

An answer that reaches the read's cap (64 KiB for `GitRemote.head`, 1 MiB for
`GitRemote.ref`) before it says what was asked fails with the new
`GitRemoteError` code `too_large` instead of `invalid_response`.
`GitRemoteError.message` now reads `git remote: <code>`, not
`git remote HEAD: <code>`, since `ref` raises it too.
