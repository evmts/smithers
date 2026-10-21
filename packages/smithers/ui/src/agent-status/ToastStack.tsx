/** @jsxImportSource react */
import { Children, type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "../button";
import { cn } from "../cn";
import { useInjectUiCss } from "../styles";
import { NOTICE_GLYPHS, NOTICE_WORDS, type NoticeState } from "./notices";

export type ToastStackProps = Omit<ComponentProps<"section">, "children"> & {
  /** The toasts, most urgent first. */
  children?: ReactNode;
  /** The person's other entries, such as settled ones. They show only while the stack is expanded, after the toasts. */
  more?: ReactNode;
  /** How many toasts show before `+N`. Default 3. */
  max?: number;
  /** The region's accessible name. Default `Notifications`. */
  label?: string;
  /**
   * `fixed` (the default) floats at the window's bottom-left; `inline` sits where it is rendered, such as just above a
   * composer, so it never covers it.
   */
  placement?: "fixed" | "inline";
};

/**
 * The toast stack (apps/mvp decision 0009 §4): bottom-left, or inline where
 * it is rendered, at most `max` toasts, and `+N` that expands the rest in
 * place: the toasts past `max`, then the `more` entries. Expanded, the button
 * reads `Less` and collapses it again. A polite live region, so a new toast is
 * announced without taking focus. Renders nothing while it has no toasts and
 * no `more` entries.
 */
export function ToastStack({
  children,
  more,
  max = 3,
  label = "Notifications",
  placement = "fixed",
  className,
  ...props
}: ToastStackProps) {
  useInjectUiCss();
  const [expanded, setExpanded] = useState(false);
  const toasts = Children.toArray(children);
  const entries = Children.toArray(more);
  if (toasts.length === 0 && entries.length === 0) return null;
  const folded = Math.max(0, toasts.length - max) + entries.length;
  return (
    <section
      data-slot="toast-stack"
      data-placement={placement}
      aria-label={label}
      aria-live="polite"
      className={cn("sui-toast-stack", className)}
      {...props}
    >
      {expanded ? toasts : toasts.slice(0, max)}
      {expanded ? entries : null}
      {folded > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="sui-toast-more"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Less" : `+${folded}`}
        </Button>
      ) : null}
    </section>
  );
}

export type ToastProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  /** The state the toast is about: its glyph, word and tone. */
  tone: NoticeState;
  /** Shown in bold in place of the state's word, such as a branch name. */
  word?: ReactNode;
  /** What it is about, in a few words, after the word. */
  detail?: ReactNode;
  /** Its one action. */
  action?: { readonly label: string; readonly onAction: () => void } | undefined;
  /** Hide: the toast goes, and what it is about stays where it lives. */
  onHide: () => void;
  /** The × button's accessible name. Default `Hide`. */
  hideLabel?: string;
  /** Not yet read: a dot before the glyph, and `Unread` for screen readers. */
  unread?: boolean;
  /** Fades in only after 300 ms (0009's rule), so a toast gone within that never flashes. */
  delayed?: boolean;
};

/**
 * One toast: the state's glyph and word, a detail on one line, at most one
 * action, and Hide. Tone follows the state: gold for needs you, ember for
 * failed, brand for working, muted for an update.
 */
export function Toast({
  tone,
  word,
  detail,
  action,
  onHide,
  hideLabel = "Hide",
  unread = false,
  delayed = false,
  className,
  ...props
}: ToastProps) {
  useInjectUiCss();
  return (
    <div
      data-slot="toast"
      data-tone={tone}
      data-unread={unread ? "" : undefined}
      data-delayed={delayed ? "" : undefined}
      className={cn("sui-toast", className)}
      {...props}
    >
      {unread ? (
        <span className="sui-toast-unread">
          <span className="sui-sr-only">Unread</span>
        </span>
      ) : null}
      <span aria-hidden className="sui-toast-glyph">
        {NOTICE_GLYPHS[tone]}
      </span>
      <span className="sui-toast-text">
        <b>{word === undefined ? NOTICE_WORDS[tone] : word}</b>
        {detail === undefined ? null : <> · {detail}</>}
      </span>
      {action === undefined ? null : (
        <Button size="sm" onClick={action.onAction}>
          {action.label}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="sui-toast-hide" aria-label={hideLabel} onClick={onHide}>
        ×
      </Button>
    </div>
  );
}
