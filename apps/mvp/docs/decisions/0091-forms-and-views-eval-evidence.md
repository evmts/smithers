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
