/**
 * Canonical renderings of controller interventions recorded in the journal.
 *
 * `CellTurn` uses these strings when it builds the live model window and
 * `Transcript` uses the same functions when it rebuilds that window. Keeping
 * the rendering here makes an intervention event sufficient to reproduce the
 * exact user message it represented.
 *
 * @since 1.0.0-rc.0
 * @private
 */
/**
 * Renders the read-only-discipline intervention.
 *
 * It asks for a decision rather than a token write. An answerable request can
 * complete without inventing work. An unfinished workspace change still needs
 * evidence or a justification for more observation, and destructive
 * writes made only to satisfy the notice are explicitly refused. A
 * justification must name how later frames differ from the quiet ones so the
 * run cannot buy a repeat by restating its plan.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const readOnly: (cap: number, frames: number) => string;
/**
 * Renders the repeated-observation intervention.
 *
 * This is separate from the read-only demand because a repeating run has
 * often already edited. It redirects the run from re-reading that edit toward
 * mechanism evidence: the failing check, symbol history, or another caller.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const repeat: (frames: number, cap: number) => string;
/**
 * Renders the unchanged-workspace completion intervention.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const unmoved: (opened: string, closed: string) => string;
/**
 * Renders the unresolved-failure completion intervention.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const unresolved: (flow: string, failed: string, instead: string) => string;
/**
 * Renders the narrowed-check completion intervention.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const narrowed: (flow: string, broader: string, narrower: string) => string;
/**
 * Renders the only-reading completion intervention.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const narrowOnly: (flow: string, check: string, targets: ReadonlyArray<string>) => string;
/**
 * Renders the completion-review intervention.
 *
 * Any of the three completion questions can ask for another frame. A low
 * completeness reading does not establish that the run invented work, so the
 * notice asks for a direct answer and makes evidence conditional on the
 * actions or results that answer actually claims. A conversational answer
 * needs no work report and must retain the person's requested format.
 *
 * The task is not quoted back. It is in the run's prefix on every frame, so a
 * quote would buy nothing and cost the window the run has to answer in, and
 * leaving it out is also what lets this text be rebuilt from the event alone.
 * No probability is quoted either: a number is journal material for a grader,
 * and in front of a model it is a score to negotiate.
 *
 * The text still warns about the narrower refusal: repeated claims of work
 * the record does not carry can end the run. Honest reports of work left
 * undone remain valid answers when that is what the run can report.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 * @private
 */
export declare const claim: () => string;
