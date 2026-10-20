/** @jsxImportSource react */
import { Children, type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "../button";
import { cn } from "../cn";
import { useInjectUiCss } from "../styles";
import { AGENT_STATUS_GLYPHS, AGENT_STATUS_WORDS, type AgentState } from "./agentStatus";

export type ToastStackProps = Omit<ComponentProps<"section">, "children"> & {
  /** The toasts, most urgent first. */
  children?: ReactNode;
  /** How many show before `+N`. Default 3. */
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
 * it is rendered, at most `max` toasts, and `+N` that shows the rest in place. A polite live region, so a
 * new toast is announced without taking focus. Renders nothing while empty.
 */
export function ToastStack({
  children,
  max = 3,
  label = "Notifications",
  placement = "fixed",
  className,
  ...props
}: ToastStackProps) {
  useInjectUiCss();
  const [expanded, setExpanded] = useState(false);
  const toasts = Children.toArray(children);
  if (toasts.length === 0) return null;
  const shown = expanded ? toasts : toasts.slice(0, max);
  const more = toasts.length - shown.length;
  return (
    <section
      data-slot="toast-stack"
      data-placement={placement}
      aria-label={label}
      aria-live="polite"
      className={cn("sui-toast-stack", className)}
      {...props}
    >
      {shown}
      {more > 0 ? (
        <Button variant="ghost" size="sm" className="sui-toast-more" onClick={() => setExpanded(true)}>
          +{more}
        </Button>
      ) : null}
    </section>
  );
}

export type ToastProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  /** The state the toast is about: its glyph and tone. */
  tone: AgentState;
  /** What it is about, in a few words, after the state's word. */
  detail?: ReactNode;
  /** Its one action. */
  action?: { readonly label: string; readonly onAction: () => void } | undefined;
  /** Hide: the toast goes, and what it is about stays where it lives. */
  onHide: () => void;
  /** Fades in only after 300 ms (0009's rule), so a toast gone within that never flashes. */
  delayed?: boolean;
};

/**
 * One toast: the state's glyph and word, a detail on one line, at most one
 * action, and Hide. Tone follows the state: gold for needs you, ember for
 * failed, brand for working.
 */
export function Toast({ tone, detail, action, onHide, delayed = false, className, ...props }: ToastProps) {
  useInjectUiCss();
  return (
    <div
      data-slot="toast"
      data-tone={tone}
      data-delayed={delayed ? "" : undefined}
      className={cn("sui-toast", className)}
      {...props}
    >
      <span aria-hidden className="sui-toast-glyph">
        {AGENT_STATUS_GLYPHS[tone]}
      </span>
      <span className="sui-toast-text">
        <b>{AGENT_STATUS_WORDS[tone]}</b>
        {detail === undefined ? null : <> · {detail}</>}
      </span>
      {action === undefined ? null : (
        <Button size="sm" onClick={action.onAction}>
          {action.label}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="sui-toast-hide" aria-label="Hide" onClick={onHide}>
        ×
      </Button>
    </div>
  );
}
