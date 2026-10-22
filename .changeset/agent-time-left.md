---
"@smthrs/harness": minor
"@smthrs/agent": minor
---

An agent with a deadline sees how long it has left. A steering drain carries the host's own notes (`Drain.notes`), which the model reads after the supervisor's messages and before the person's, and which never count as a person's instruction or answer a park. `Steering.withTimeLeft` notes the time left at each boundary a run continues through, and `AgentAction` with a `timeout` uses it, so each turn says "Time left: 12 of your 40 minutes." The note is read inside the recorded drain, so a replay tells the same time.
