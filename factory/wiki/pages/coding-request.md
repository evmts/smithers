# From a prompt to a measured coding outcome

`coding/request` declares the `coding/Request` repository flow. Its input is `{ prompt, feedback?, maxRounds?, base?, wiki? }`. `base` selects the source revision for a stack request; `wiki` supplies its published repository context.

## Compose ordinary native children

`coding/Request` prepares a plan with a `PrepareRequest` child, admits that plan's source with `AdmitSource`, then hands the prepared plan to a private `coding/CoordinateRequest` child. A stack request with a `base` first stands on a fresh working change before preparing.

The coordinator receives feedback before implementation. With no new messages it admits the source again and runs the bounded `CorrectPlan` child, then receives feedback once more after correction. With no messages at either boundary it finishes with `{ plan, outcome }`.

Prototypes are not part of this request. `coding/Prototype` is a separate flow that prepares and admits source, runs the `Poc` child, then admits the source again and returns its result.

## Fence the inspected source

`AdmitSource` compares the observed native head and base with the prepared plan before and after its admission snapshot. It refuses a changed source or a plan without `observedHead`. Cloud admission first publishes the original source under the request's durable identity. These checks do not lock the workspace for the rest of the run.

## Read the domain result

The result pairs the final prepared `plan` with the correction `outcome`, whose status is `validated`, `changes-requested` or `blocked`. `maxRounds` defaults to three and admits one through eight; the first implementation counts as a pass. A `blocked` outcome carries its blocking execution ID and message; a parked stall also carries `stalled` details. A completed engine run does not by itself assert validation.

## Apply feedback at safe boundaries

A message delivered before implementation causes another planning pass before correction starts. A message delivered during implementation waits for correction to settle, then triggers a new plan against freshly gathered source. The coordinator never edits an executing plan or interrupts a writer.

The coordinator cursor is ordinary durable Flow payload driven by the existing trampoline. There are at most eight planning passes; reaching that limit is a typed refusal naming the retained message IDs. Merged feedback keeps the exact message IDs, text and provenance, and nothing is silently truncated.

The empty final after-correction receipt closes the coordinator for new feedback. A message that wins that race is drained and replanned; a later message is refused, and the caller can start another request.
