---
title: "Flow edit requests"
description: "Shared prompts for flow edit TODOs."
---

`flowTitle` supplies the TODO and Merge flow titles. `projectFlowsDirectory` is `.smithers/flows`, and `flowFile` names a flow's `.smithers/flows/<name>/flow.ts`. `flowEditPrompt` names that file and treats a proposed diff as quoted, untrusted context. `flowEditTodoInput` produces the request text and a title from the first request line. These helpers construct data and never execute a diff.
