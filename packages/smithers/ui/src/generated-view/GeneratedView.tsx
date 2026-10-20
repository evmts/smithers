/** @jsxImportSource react */
// The frame-side modules only: the package root also exports the presentation
// realm, whose harness a shared View must not reach (C-UI-08).
import * as Bridge from "@smthrs/views/Bridge";
import type * as Interactions from "@smthrs/views/Interactions";
import * as ViewCsp from "@smthrs/views/ViewCsp";
import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn";
import { composeSmithersUiStyles, useInjectUiCss } from "../styles";
import { frameBaseCss } from "./generatedViewCss";
import { frameRuntime } from "./runtime.generated";

/** An interaction the page admitted: a declared `state` or `message` event. */
export type GeneratedViewInteraction = Extract<Bridge.Verdict, { readonly _tag: "State" | "Message" }>;

/** Only layout passes through to the host element: a handler there would bypass the declared interactions (C-UI-08). */
export type GeneratedViewProps = Pick<ComponentProps<"div">, "className" | "style"> & {
  /** The view's HTML, as the presentation realm rendered it. */
  html: string;
  /** The view's declared events: anything else the frame sends is refused. */
  interactions: Interactions.Declared;
  /** The frame's accessible name. */
  title: string;
  theme: Bridge.Theme;
  /** `inline` (default) in a message, 80 to 480 px tall; `full` fills its container. */
  size?: Bridge.Size | undefined;
  /** A declared event from a real click or submit in the frame. */
  onInteraction: (interaction: GeneratedViewInteraction) => void;
  /** A message the page refused, by reason only. */
  onRefused?: ((reason: Bridge.Refusal) => void) | undefined;
  /** The frame runtime; defaults to the one this package builds. */
  runtime?: string | undefined;
  /** The frame's style sheet; defaults to the component library's, with its theme. */
  styles?: string | undefined;
  /** The page's clock for the interaction rate, in milliseconds. */
  now?: (() => number) | undefined;
};

const defaultStyles = () => `${frameBaseCss}${composeSmithersUiStyles({ withTheme: true })}`;

/** A fresh per-mount secret: 24 random bytes as base64url. */
const newNonce = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Whether the element is on screen, or `true` where nothing can tell. */
const useVisible = (element: HTMLElement | null): boolean => {
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), {
      rootMargin: "200px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return visible;
};

/**
 * Shows a generated view's HTML in a sandboxed frame, and turns what a person
 * does in it into declared interactions.
 *
 * The frame is `<iframe sandbox="allow-scripts" srcdoc>`: an opaque origin
 * whose CSP admits only the frame runtime, pinned by hash. No model code runs
 * in it; the runtime sanitizes the HTML it is sent and reports clicks on
 * `data-event` elements. The page answers one `ui/initialize`, from this
 * frame with this mount's nonce, and talks to the frame over the port it
 * transfers. Every message from the frame passes `Bridge.receive`. The frame
 * mounts only while it is near the screen.
 */
export function GeneratedView({
  html,
  interactions,
  title,
  theme,
  size = "inline",
  onInteraction,
  onRefused,
  runtime = frameRuntime,
  styles,
  now = Date.now,
  className,
  style,
}: GeneratedViewProps) {
  useInjectUiCss();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const visible = useVisible(host);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>(Bridge.inlineHeight.min);
  const latest = useRef({ html, theme, size, interactions, onInteraction, onRefused, now });
  latest.current = { html, theme, size, interactions, onInteraction, onRefused, now };
  const port = useRef<MessagePort | undefined>(undefined);
  const sent = useRef({ html, theme });

  // A new nonce, and so a new document, each time the frame mounts.
  const nonce = useMemo(() => (visible ? newNonce() : ""), [visible]);
  const sheet = useMemo(() => styles ?? defaultStyles(), [styles]);
  const srcDoc = useMemo(
    () => (visible ? ViewCsp.frameDocument({ runtime, nonce, theme: latest.current.theme, styles: sheet }) : undefined),
    [visible, runtime, nonce, sheet],
  );

  useEffect(() => {
    if (!visible) return;
    let window: Bridge.RateWindow = [];
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      const asks = typeof data === "object" && data !== null && (data as { method?: unknown }).method === "ui/initialize";
      if (!asks) return;
      const contentWindow = frame.current?.contentWindow;
      const initialize = event.source === contentWindow && contentWindow !== null && port.current === undefined
        ? Bridge.acceptInitialize(data, nonce)
        : undefined;
      if (initialize === undefined || initialize._tag === "None") {
        latest.current.onRefused?.("wrong_source");
        return;
      }
      const channel = new MessageChannel();
      port.current = channel.port1;
      channel.port1.onmessage = (message) => {
        const current = latest.current;
        const received = Bridge.receive({
          message: message.data,
          declared: current.interactions,
          window,
          now: current.now(),
        });
        window = received.window;
        const verdict = received.verdict;
        if (verdict._tag === "Resize") setHeight(Bridge.inlineFrameHeight(verdict.height));
        else if (verdict._tag === "Refused") current.onRefused?.(verdict.reason);
        else current.onInteraction(verdict);
      };
      const { html: currentHtml, size: currentSize, theme: currentTheme } = latest.current;
      sent.current = { html: currentHtml, theme: currentTheme };
      contentWindow!.postMessage(
        Bridge.initializeResult(initialize.value, { html: currentHtml, theme: currentTheme, size: currentSize }),
        "*",
        [channel.port2],
      );
    };
    globalThis.addEventListener("message", onMessage);
    return () => {
      globalThis.removeEventListener("message", onMessage);
      port.current?.close();
      port.current = undefined;
    };
  }, [visible, nonce]);

  useEffect(() => {
    if (port.current === undefined) return;
    const changed: { html?: string; theme?: Bridge.Theme } = {};
    if (html !== sent.current.html) changed.html = html;
    if (theme !== sent.current.theme) changed.theme = theme;
    if (changed.html === undefined && changed.theme === undefined) return;
    sent.current = { html, theme };
    port.current.postMessage(Bridge.hostContextChanged(changed));
  }, [html, theme]);

  return (
    <div
      ref={setHost}
      data-slot="generated-view"
      data-size={size}
      className={cn("sui-generated-view", className)}
      style={size === "inline" ? { height, ...style } : style}
    >
      {srcDoc === undefined ? null : (
        <iframe
          ref={frame}
          className="sui-generated-view-frame"
          title={title}
          sandbox={ViewCsp.sandbox}
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          style={size === "inline" ? { height } : undefined}
        />
      )}
    </div>
  );
}
