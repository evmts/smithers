/** @jsxImportSource react */
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { personLane } from "./internal/person";
import { useInjectUiCss } from "./styles";

/**
 * Other people's carets in a text field everyone edits at once, as Google
 * Docs and Figma show them: each person's caret and selection in their color,
 * the caret flagged with their name. A field stays an ordinary `<textarea>` or
 * `<input>`; the carets are drawn over it by a mirror that copies its metrics
 * and scroll, and never take the pointer.
 */

/** Someone else's caret in a field: where their selection started (`anchor`) and where the caret is (`head`). */
export interface Collaborator {
  /** A stable key; it also picks the person's color, as `AvatarStack` does. */
  readonly id: string;
  /** Their name, flagged on the caret. */
  readonly name: string;
  readonly anchor: number;
  readonly head: number;
}

/** Where a field's selection is: where it started and where the caret is, equal for a caret. */
export interface FieldSelection {
  readonly anchor: number;
  readonly head: number;
}

type Field = HTMLTextAreaElement | HTMLInputElement;

/** A field's selection now, its direction kept: a selection made backwards has its caret at the start. */
export function selectionOf(field: Field): FieldSelection {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  return field.selectionDirection === "backward" ? { anchor: end, head: start } : { anchor: start, head: end };
}

/**
 * Keeps a controlled field's caret where the person left it when its value
 * changes from outside, such as someone else's typing: on such a change, a
 * focused field takes `selection`, where the person's selection now is in the
 * new value. A change the person typed keeps the browser's own caret. Call the
 * function it returns with each value the person types.
 */
export function useSharedSelection(
  field: RefObject<Field | null>,
  value: string,
  selection: FieldSelection | undefined,
): (typed: string) => void {
  const typed = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = field.current;
    const outside = typed.current !== value;
    typed.current = value;
    if (!outside || element === null || selection === undefined || element.ownerDocument.activeElement !== element) return;
    const start = Math.min(selection.anchor, selection.head);
    const end = Math.max(selection.anchor, selection.head);
    element.setSelectionRange(start, end, selection.head < selection.anchor ? "backward" : "forward");
  }, [field, value, selection]);
  return (next) => {
    typed.current = next;
  };
}

/** The properties a mirror copies from its field, so its text lays out as the field's does. */
const MIRRORED = [
  "box-sizing",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "letter-spacing",
  "word-spacing",
  "line-height",
  "text-transform",
  "text-indent",
  "text-align",
  "tab-size",
  "overflow-wrap",
  "word-break",
] as const;

/** Lays `mirror` out as `field` is, over it, and scrolled as far. */
function follow(field: Field, outer: HTMLElement, mirror: HTMLElement): void {
  const style = field.ownerDocument.defaultView!.getComputedStyle(field);
  for (const property of MIRRORED) mirror.style.setProperty(property, style.getPropertyValue(property));
  const single = field instanceof HTMLInputElement;
  mirror.style.whiteSpace = single ? "pre" : "pre-wrap";
  const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  mirror.style.width = `${field.clientWidth + (borderX || 0)}px`;
  if (single) {
    // An input centers its one line; a line as tall as its content box does too.
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    mirror.style.lineHeight = `${Math.max(0, field.clientHeight - (padding || 0))}px`;
  }
  mirror.style.transform = `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`;
  outer.style.top = `${field.offsetTop}px`;
  outer.style.left = `${field.offsetLeft}px`;
  outer.style.width = `${field.offsetWidth}px`;
  outer.style.height = `${field.offsetHeight}px`;
}

/** The text between two places, as the mirror shows it: transparent, with each selection marked in its owner's color. */
function pieces(value: string, collaborators: ReadonlyArray<Collaborator>): ReactNode[] {
  const clamp = (index: number) => Math.max(0, Math.min(value.length, index));
  const ranges = collaborators.map((person) => ({
    person,
    from: clamp(Math.min(person.anchor, person.head)),
    to: clamp(Math.max(person.anchor, person.head)),
    head: clamp(person.head),
  }));
  const stops = [...new Set([0, value.length, ...ranges.flatMap(({ from, to }) => [from, to])])].sort((a, b) => a - b);
  const nodes: ReactNode[] = [];
  for (const [index, at] of stops.entries()) {
    for (const range of ranges) {
      if (range.head !== at) continue;
      nodes.push(
        <span
          key={`caret-${range.person.id}`}
          data-slot="collaborator-caret"
          data-name={range.person.name}
          data-lane={personLane(range.person.id)}
          className="sui-collaborator-caret"
        >
          <span className="sui-collaborator-name">{range.person.name}</span>
        </span>,
      );
    }
    const next = stops[index + 1];
    if (next === undefined) break;
    const text = value.slice(at, next);
    const owner = ranges.find((range) => range.from <= at && next <= range.to && range.from < range.to);
    nodes.push(
      owner === undefined ? text : (
        <mark
          key={`selection-${at}`}
          data-slot="collaborator-selection"
          data-lane={personLane(owner.person.id)}
          className="sui-collaborator-selection"
        >
          {text}
        </mark>
      ),
    );
  }
  return nodes;
}

export type CollaboratorCaretsProps = {
  /** The field the carets belong to; it and the carets share a positioned parent. */
  readonly field: RefObject<Field | null>;
  /** The field's value, as it shows. */
  readonly value: string;
  readonly collaborators: ReadonlyArray<Collaborator>;
};

/**
 * Draws `collaborators`' carets and selections over `field`. Render it beside
 * the field, inside a positioned parent such as `.sui-collaborative-field`,
 * which `ChatComposer` and `NeedsYouCard` wrap their field in. Renders nothing
 * when nobody else is there.
 */
export function CollaboratorCarets({ field, value, collaborators }: CollaboratorCaretsProps) {
  useInjectUiCss();
  const outer = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const layout = () => {
    if (field.current !== null && outer.current !== null && mirror.current !== null) {
      follow(field.current, outer.current, mirror.current);
    }
  };
  useLayoutEffect(layout);
  useEffect(() => {
    const element = field.current;
    if (element === null) return;
    element.addEventListener("scroll", layout);
    return () => element.removeEventListener("scroll", layout);
  });
  if (collaborators.length === 0) return null;
  return (
    <div ref={outer} data-slot="collaborator-carets" className="sui-collaborator-carets" aria-hidden>
      <div ref={mirror} className="sui-collaborator-mirror">
        {pieces(value, collaborators)}
        {/* A field shows a last empty line after a trailing newline; a mirror needs a character to. */}
        {"​"}
      </div>
    </div>
  );
}
