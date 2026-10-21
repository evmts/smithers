/**
 * The flow-draft card's vocabulary (apps/mvp decision 0014 §5): a draft's
 * status as one line, which of the person's answers differ from what the
 * draft holds, and what Answer sends. Framework-free.
 */

/** Where a draft stands. */
export type DraftStatus = "drafting" | "needs_you" | "ready" | "failed" | "saved" | "proposed";

/** A question a round asked, with the default it assumed and the answer it holds, if any. */
export interface DraftQuestion {
  readonly id: string;
  readonly text: string;
  readonly assumed: string;
  /** Whether the round waits for it: shown as `Needs you`. */
  readonly blocking: boolean;
  readonly answer?: string;
}

/** One static check of a draft, and its failure code. */
export interface DraftCheck {
  readonly check: string;
  readonly ok: boolean;
  readonly code?: string;
}

/** One drafted file. */
export interface DraftFile {
  readonly path: string;
  readonly text: string;
}

/** A status as its line reads: `◌ Drafting · round 2`, `◆ Needs you`, `✓ Ready`, `✕ Failed`, `✓ Saved`, `✓ Proposed`. */
export const draftStatusLine = (status: DraftStatus, round: number): string => {
  switch (status) {
    case "drafting":
      return round > 0 ? `◌ Drafting · round ${round + 1}` : "◌ Drafting";
    case "needs_you":
      return "◆ Needs you";
    case "ready":
      return "✓ Ready";
    case "failed":
      return "✕ Failed";
    case "saved":
      return "✓ Saved";
    case "proposed":
      return "✓ Proposed";
  }
};

/** What a question's field shows: the person's unsent answer, else the answer the draft holds, else the default it assumed. */
export const questionValue = (question: DraftQuestion, answers: Readonly<Record<string, string>>): string =>
  answers[question.id] ?? question.answer ?? question.assumed;

/** Whether the field still shows the assumed default: nobody answered it. */
export const isAssumed = (question: DraftQuestion, answers: Readonly<Record<string, string>>): boolean =>
  answers[question.id] === undefined && question.answer === undefined;

/** The answers that change what the draft holds: each unsent answer that differs from its question's current value. */
export const changedAnswers = (
  questions: ReadonlyArray<DraftQuestion>,
  answers: Readonly<Record<string, string>>,
): ReadonlyArray<{ readonly id: string; readonly value: string }> =>
  questions.flatMap((question) => {
    const value = answers[question.id];
    return value !== undefined && value !== (question.answer ?? question.assumed) ? [{ id: question.id, value }] : [];
  });

/**
 * What Answer sends: each changed answer, and each blocking question nobody
 * answered at the value its field shows, so a person can accept a blocking
 * question's assumed default as their answer. A field left empty sends
 * nothing.
 */
export const answersToSend = (
  questions: ReadonlyArray<DraftQuestion>,
  answers: Readonly<Record<string, string>>,
): ReadonlyArray<{ readonly id: string; readonly value: string }> =>
  questions.flatMap((question) => {
    const value = questionValue(question, answers);
    if (value.trim() === "") return [];
    const changed = answers[question.id] !== undefined && value !== (question.answer ?? question.assumed);
    return changed || (question.blocking && question.answer === undefined) ? [{ id: question.id, value }] : [];
  });
