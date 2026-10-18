import { tokens as t } from "../tokens";

/**
 * Wordmark CSS fragment, composed into `smithersUiCss` by uiCss.ts.
 *
 * The mark's font size follows the viewport, a named exception to the type
 * scale: 63 monospace columns at 0.6em each span about 38em, so the size is
 * clamped between 4px and 16px. On load each row scans in, then a sheen
 * sweeps across; on hover the rows ripple. The global reduced-motion policy
 * turns all of it off.
 */
export const wordmarkCss = `
.sui-wordmark { margin:0; font-family:${t.fontMono}; font-size:clamp(4px, 2.2vw, 16px); font-weight:400; line-height:1.07; letter-spacing:0; white-space:pre; color:${t.primary}; }
.sui-wordmark-row { display:block; --sui-wordmark-scan-edge:0 8% 0 0; --sui-wordmark-scan-offset:-0.12em; color:transparent; background-image:linear-gradient(105deg, ${t.primary} 42%, color-mix(in srgb, ${t.primary} 72%, transparent) 49%, ${t.primary} 56%); background-size:300% 100%; background-position:0 0; background-clip:text; -webkit-background-clip:text; animation:sui-wordmark-scan 420ms cubic-bezier(0.16, 1, 0.3, 1) calc(40ms + var(--sui-wordmark-row) * 20ms) backwards, sui-wordmark-sweep 480ms cubic-bezier(0.4, 0, 0.2, 1) 360ms backwards; transition:transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1.15), opacity 380ms ease; transition-delay:calc(var(--sui-wordmark-row) * 22ms); }
.sui-wordmark-row:nth-child(even) { --sui-wordmark-scan-edge:0 0 0 8%; --sui-wordmark-scan-offset:0.12em; }
@media (hover: hover) { .sui-wordmark:hover .sui-wordmark-row { transform:translateY(calc((var(--sui-wordmark-row) - 2) * -2px)) scale(1.012); opacity:0.88; } }
.sui-wordmark:active .sui-wordmark-row { transform:translateY(2px) scale(0.99); opacity:0.7; transition-duration:100ms; transition-delay:0ms; }
@keyframes sui-wordmark-scan { from { clip-path:inset(var(--sui-wordmark-scan-edge)); transform:translateX(var(--sui-wordmark-scan-offset)); } to { clip-path:inset(0); transform:none; } }
@keyframes sui-wordmark-sweep { from { background-position:100% 0; } to { background-position:0 0; } }
`;
