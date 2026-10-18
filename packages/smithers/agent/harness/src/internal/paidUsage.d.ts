/**
 * The model usage a recorded boundary paid for, summed over its readings.
 *
 * @since 1.0.0-rc.1
 * @private
 */
import type * as Classifier from "@smthrs/model/Classifier";
import * as Evaluator from "@smthrs/model/Evaluator";
import * as Pricing from "@smthrs/model/Pricing";
import type * as EngineLike from "../EngineLike.ts";
/**
 * One reading's metered usage and the model that read it; absent when the
 * transport reported none.
 *
 * @since 1.0.0-rc.1
 * @private
 */
export type Metered = Evaluator.Usage | undefined;
/**
 * Sums the readings that were metered, one share per model in the order each
 * model first read. `undefined` when none was: a reading the transport did not
 * meter is not a reading that cost zero.
 *
 * @since 1.0.0-rc.1
 * @private
 */
export declare const paidUsage: (readings: ReadonlyArray<Metered>) => ReadonlyArray<EngineLike.Paid> | undefined;
/**
 * What one metered reading cost at the instant `at`, under the rate card of
 * the model that read it. `undefined` for a reading the transport did not
 * meter and for a model the card does not price: neither cost zero.
 *
 * @since 1.0.0-rc.1
 * @private
 */
export declare const readingCost: (reading: Metered, at: number) => Pricing.Cost | undefined;
/**
 * What two readings of one completion paid together. Either may come back
 * unmetered; the completion costs what was metered. Both ask the same judge,
 * so the sum keeps its model id, and drops it only when a fallback answered
 * one.
 *
 * @since 1.0.0-rc.1
 * @private
 */
export declare const paidTogether: (first: Evaluator.Usage | undefined, second: Evaluator.Usage | undefined) => Evaluator.Usage | undefined;
/**
 * A reading that failed, as the typed cause its turn fails with: the
 * transport's code and structured facts, its public message (a transport's
 * own text can name hosts and URLs), and what it paid with what the
 * `earlier` readings of the same completion paid, so the run's budget
 * charges both (#3010).
 *
 * @since 1.0.0-rc.1
 * @private
 */
export declare const failedReading: (error: Classifier.ClassifierError, earlier: Evaluator.Usage | undefined) => Evaluator.EvaluatorError;
