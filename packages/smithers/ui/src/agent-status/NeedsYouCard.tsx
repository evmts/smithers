/** @jsxImportSource react */
import { type ComponentProps, type FormEvent, useEffect, useId, useRef } from "react";
import { Button } from "../button";
import { cn } from "../cn";
import { Input } from "../input";
import { useInjectUiCss } from "../styles";
import { AgentStatusPill } from "./AgentStatusPill";

/** What the agent asks for: an answer in words (or one of `options`), or Approve or Deny. */
export type NeedsYouKind = "question" | "approval";

/** An answer: the words or option for a question, `true` (Approve) or `false` (Deny) for an approval. */
export type NeedsYouAnswer = string | boolean;

export type NeedsYouCardProps = Omit<ComponentProps<"div">, "children" | "onChange"> & {
  kind: NeedsYouKind;
  /** The question, in the agent's own words. */
  prompt: string;
  /** Answers the person can pick with one press, for a question. */
  options?: ReadonlyArray<string>;
  /** The field's text: the app keeps the draft. */
  value: string;
  onValueChange: (value: string) => void;
  onAnswer: (answer: NeedsYouAnswer) => void;
  /** The accepted answer: the card collapses to it. */
  answered?: NeedsYouAnswer | undefined;
  /** While an answer is on its way: the controls are disabled. */
  sending?: boolean;
  /** Focuses the field and scrolls the card into view each time it changes, for a toast's or header's Answer. */
  focusRequest?: number | undefined;
};

/** How an accepted answer reads. */
export const answerText = (answer: NeedsYouAnswer): string =>
  answer === true ? "Approved" : answer === false ? "Denied" : answer;

/**
 * What the agent needs from the person: its question with a field and the
 * options as buttons, or an approval with Approve and Deny. Controlled: the
 * draft is `value`, and the card answers through `onAnswer`. Once `answered`
 * is set it collapses to that answer.
 */
export function NeedsYouCard({
  kind,
  prompt,
  options,
  value,
  onValueChange,
  onAnswer,
  answered,
  sending = false,
  focusRequest,
  className,
  ...props
}: NeedsYouCardProps) {
  useInjectUiCss();
  const promptId = useId();
  const card = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const approve = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusRequest === undefined) return;
    card.current?.scrollIntoView?.({ block: "nearest" });
    const target = field.current ?? approve.current;
    target?.focus();
  }, [focusRequest]);

  if (answered !== undefined) {
    return (
      <div
        data-slot="needs-you"
        data-state="answered"
        className={cn("sui-needs-you-answered", className)}
        aria-label="Answered"
        {...props}
      >
        <span className="sui-needs-you-answered-label">
          <span aria-hidden>✓</span> Answered
        </span>
        <span className="sui-needs-you-answer">{answerText(answered)}</span>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (text !== "" && !sending) onAnswer(text);
  };

  return (
    <div
      ref={card}
      role="group"
      aria-labelledby={promptId}
      data-slot="needs-you"
      data-state="open"
      data-kind={kind}
      className={cn("sui-needs-you", className)}
      {...props}
    >
      <div>
        <AgentStatusPill state="needs_you" />
      </div>
      <p id={promptId} className="sui-needs-you-prompt">
        {prompt}
      </p>
      {kind === "approval" ? (
        <div className="sui-needs-you-row">
          <Button ref={approve} disabled={sending} onClick={() => onAnswer(true)}>
            Approve
          </Button>
          <Button variant="outline" disabled={sending} onClick={() => onAnswer(false)}>
            Deny
          </Button>
        </div>
      ) : (
        <>
          {options !== undefined && options.length > 0 ? (
            <div className="sui-needs-you-row">
              {options.map((option) => (
                <Button key={option} variant="outline" disabled={sending} onClick={() => onAnswer(option)}>
                  {option}
                </Button>
              ))}
            </div>
          ) : null}
          <form className="sui-needs-you-row" onSubmit={submit}>
            <Input
              ref={field}
              className="sui-needs-you-field"
              value={value}
              placeholder="Your answer"
              aria-label="Your answer"
              disabled={sending}
              onChange={(event) => onValueChange(event.currentTarget.value)}
            />
            <Button type="submit" disabled={sending || value.trim() === ""}>
              Answer
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
