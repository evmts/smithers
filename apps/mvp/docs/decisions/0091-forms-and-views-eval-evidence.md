# 0091: Forms and views eval evidence

Accepted implementation choice, 2026-10-23; implements decision 0004 §§3, 8–9
and rulings FLOW-5 and TEST-11 without changing their expectations.

The live no-URL clone transcript asked in prose without calling a flow. Teach
missing-input forms in the chat system, and distinguish visible forms and views
from private flow results. A shown form ends the answer with “Form ready.”;
its submission is the next question. Explicit same-answer ask-and-act requests
keep `app/agent/ask`.

The renderer sometimes spent all 4,096 output tokens with an empty text reply.
Its seat now supplies an 8,000-token default, like the chat agent, configurable
by injection. The model role, validation, safety checks, correction count,
suite score threshold and reservation accounting remain the existing ones.

The judge must see persisted views to assess a claim that a form or board is
ready. It judges the answer's words, using internal call data only as evidence.
A form collecting a missing repository is the action required by 0004, not a
claim that cloning completed. Live calibration retains false claims, prose-only
questions and internal wording as negative examples. Synthetic eval model
transcripts belong in result artifacts, never application logs.

The SDK intentionally does not send `seatNote` to Jev. The common evidence
instructions must therefore be included in every question, not only in that
generation-seat note. The scorer configuration includes those instructions so
the changed judging contract cannot silently compare against its old digest.

The complete agent run also exposed a file-view miss: “show lines” was treated
as a sandbox read. File tabs are visible effects too. Teach the existing
`file/open` contract explicitly: the tab supplies the repository context, and
showing a file needs no checkout. Its unchanged live eval is the regression.

The complete flow run exposed two more prompt failures: a refused `repo/refs`
was followed by a sandbox command, and a refused sandbox read by unrelated UI
actions. Teach that `{ ok: false, error }` is a refusal even without a thrown
exception; dependent actions must stop. FLOW-5 requires acting through the
requested flow, not evading its refusal. The existing exact-call checks remain
the regressions.

Clarify the sandbox-read prompt to request sandbox contents explicitly. Its
former “show me package.json” overlaps the native file-tab action required by
SCOPE-6 feature 4, FLOW-3 and decision 0004's preference for native views. The
`sandbox/read` call, path and no-extra-effects expectations are unchanged; the
separate show-lines case continues to require `file/open`.

The conversation archive case's expectation was correct. Its harness omitted
the real ConversationApi route and therefore refused a valid archive request.
Route that API through the same database and authenticated test boundary as
production. A real openAgent regression verifies the persisted archive flag.

A complete follow-up run exposed duplicate drafting: the model printed an
example call in its planning and then the intended cell. The cell contract
executes all executable fences together, so both drafts were real. Teach the
chat seat to emit only its cell program and each requested effect once. The
unchanged `flow-new` exact-once and one-draft checks retain this regression.
