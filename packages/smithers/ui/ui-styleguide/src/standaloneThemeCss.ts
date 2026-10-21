import { paletteThemeCss } from "./paletteThemeCss.ts";

/**
 * One document-wide motion policy for every house stylesheet and consumer CSS.
 * Keeping this selector global means late-injected adapter styles, monitor
 * animations, and component transitions inherit the same preference without
 * component-specific media queries.
 *
 * Reduced motion ends every animation and transition at once, and drops its
 * delay, unless the element names a hold in `--motion-hold`: a wait is not
 * motion, so a loading state that stays hidden for its first moments (so a
 * fast load never flashes) keeps that wait. The property doesn't inherit, so
 * a hold covers only the element that names it.
 */
export const reducedMotionCss = `@property --motion-hold { syntax:'<time>'; inherits:false; initial-value:0ms; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-delay:var(--motion-hold, 0ms) !important; animation-duration:0.001ms !important; animation-iteration-count:1 !important; scroll-behavior:auto !important; transition-delay:var(--motion-hold, 0ms) !important; transition-duration:0.001ms !important; }
}`;

const standaloneCss = [
  ...paletteThemeCss('"'),
  `* { box-sizing:border-box; } body { min-width:320px; min-height:100vh; margin:0; font-family:var(--font-sans); background:var(--bg); color:var(--text); line-height:var(--lh-body); } h1,h2,h3 { color:var(--text); line-height:1.25; } a { color:var(--brand); } code:not(:where(.pierre-diff *)) { font-family:var(--font-mono); background:var(--surface-2); color:var(--text); padding:.1em .3em; border-radius:var(--r-1); } pre:not(:where(.pierre-diff *)) { overflow:auto; background:var(--code-bg); color:var(--code-text); padding:1em; border-radius:var(--r-1); } pre:not(:where(.pierre-diff *)) code:not(:where(.pierre-diff *)) { padding:0; background:var(--code-bg); color:var(--code-text); } table { width:100%; border-collapse:collapse; } th,td { border-bottom:1px solid var(--border); padding:.5em; text-align:left; } hr { border:0; border-top:1px solid var(--border); }`,
  reducedMotionCss,
].join("\n");

/**
 * A complete theme for HTML that is rendered outside a Smithers UI shell.
 *
 * Built once at module evaluation, from the same frozen registry snapshot as
 * `workflowUiThemeCss`, so the two surfaces cannot answer differently for one
 * selected theme and repeat calls cost nothing.
 */
export function standaloneThemeCss(): string {
  return standaloneCss;
}
