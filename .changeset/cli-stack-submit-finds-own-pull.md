---
"@smthrs/cli": patch
---

`smthrs stack submit` finds the pull request a change opened by the change's own head bookmark and a hidden
`<!-- smithers:write=<change id> -->` marker in its body, open or closed, before it opens one, and again after GitHub
refuses a second one from that head. A run that died after GitHub opened the pull request, before the stack state
recorded it, now adopts it instead of failing on GitHub's 422. A pull request from the same head without the marker is
never adopted, and a head with more pull requests than one page holds fails rather than open a second.
