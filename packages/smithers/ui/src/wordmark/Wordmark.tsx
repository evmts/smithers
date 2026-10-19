/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { cn } from "../cn";
import { useInjectUiCss } from "../styles";

/** The Smithers mark: six rows of box-drawing text, each the same width. */
export const WORDMARK: readonly string[] = [
  "███████╗███╗   ███╗██╗████████╗██╗  ██╗███████╗██████╗ ███████╗",
  "██╔════╝████╗ ████║██║╚══██╔══╝██║  ██║██╔════╝██╔══██╗██╔════╝",
  "███████╗██╔████╔██║██║   ██║   ███████║█████╗  ██████╔╝███████╗",
  "╚════██║██║╚██╔╝██║██║   ██║   ██╔══██║██╔══╝  ██╔══██╗╚════██║",
  "███████║██║ ╚═╝ ██║██║   ██║   ██║  ██║███████╗██║  ██║███████║",
  "╚══════╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝",
];

export type WordmarkProps = { className?: string };

/**
 * The Smithers mark in brand color, sized to the viewport, with an entrance
 * scan and a hover ripple. It is decorative (`aria-hidden`), so give the
 * surrounding element the accessible name, for example
 * `<h1 aria-label="Smithers"><Wordmark /></h1>`.
 */
export function Wordmark({ className }: WordmarkProps) {
  useInjectUiCss();
  return (
    <pre className={cn("sui-wordmark", className)} aria-hidden="true">
      {WORDMARK.map((line, row) => (
        <span key={row} className="sui-wordmark-row" style={{ "--sui-wordmark-row": row } as CSSProperties}>
          {line}
        </span>
      ))}
    </pre>
  );
}
