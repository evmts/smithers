/** @jsxImportSource react */
/**
 * The package's one sheet: the repository view, the code view and the diff
 * view's frame. Every rule reads `@smthrs/ui`'s theme tokens, so the views
 * follow light and dark, and every class is `sui-` namespaced like the rest
 * of the Smithers components. The Markdown editor ships its own sheet
 * (`markdownEditorCss`).
 *
 * The repository view sizes itself from its own width, not the window's
 * (`container-type: inline-size`), so the same view lays out right as a page
 * and inside a conversation: below 720px it drops the tree and stacks.
 */
import { tokens as t } from "@smthrs/ui";
import { useInsertionEffect } from "react";

const focusRing = `outline:none; border-color:${t.ringBorder}; box-shadow:0 0 0 3px ${t.ring};`;
const interaction = "transition:background-color .12s ease, border-color .12s ease, color .12s ease;";

/** `PierreDiffView`: a thin frame; pierre's `CodeView` owns the highlighted body. */
const pierreDiffCss = `
.sui-pierre-diff-frame { min-width:0; border-radius:${t.radius}; background:${t.card}; color:${t.foreground}; }
.sui-pierre-diff { --diffs-font-family:${t.fontMono}; --diffs-header-font-family:${t.fontSans}; --diffs-light-bg:${t.card}; --diffs-dark-bg:${t.card}; --diffs-light:${t.foreground}; --diffs-dark:${t.foreground}; --diffs-addition-color:${t.success}; --diffs-deletion-color:${t.destructive}; --diffs-bg-addition-override:${t.successSoft}; --diffs-bg-deletion-override:${t.destructiveSoft}; --diffs-bg-context-override:${t.surface2}; --diffs-bg-separator-override:${t.surface2}; --diffs-fg-number-override:${t.mutedForeground}; display:block; min-width:0; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; color:${t.foreground}; overflow:hidden; }
.sui-pierre-diff-empty { padding:24px; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; text-align:center; color:${t.mutedForeground}; font-size:13px; }
`;

/*
 * `CodeFileView`: one file on the same pierre engine. The frame follows the
 * house CODE tokens on both theme axes so a file reads like the app's other
 * code, and pierre's own background variables point at the same token. The
 * plain `<pre>` is the complete state until pierre has painted; the view
 * flips `data-state` and the sheet hides the fallback.
 */
const codeViewCss = `
.sui-code-view { --diffs-font-family:${t.fontMono}; --diffs-light-bg:${t.codeBg}; --diffs-dark-bg:${t.codeBg}; --diffs-light:${t.codeText}; --diffs-dark:${t.codeText}; --diffs-fg-number-override:${t.mutedForeground}; display:block; min-width:0; border-radius:${t.radius}; background:${t.codeBg}; color:${t.codeText}; overflow:hidden; }
.sui-code-view > diffs-container { display:block; min-width:0; }
.sui-code-view-plain { margin:0; padding:12px 14px; font-family:${t.fontMono}; font-size:12px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; tab-size:4; }
.sui-code-view[data-state="ready"] > .sui-code-view-plain { display:none; }
`;

/** `RepoView`: the tree beside the content, the header, a directory's listing and README, and a file. */
const repositoryCss = `
.sui-repo { container-type:inline-size; min-width:0; color:${t.foreground}; }
.sui-repo-layout { min-width:0; display:grid; grid-template-columns:minmax(0, 1fr); gap:16px; }
.sui-repo[data-size='full'] > .sui-repo-layout { grid-template-columns:240px minmax(0, 1fr); align-items:start; }
.sui-repo-side { position:sticky; top:0; min-width:0; max-height:100vh; display:grid; gap:4px; padding-right:12px; border-right:1px solid ${t.border}; overflow:auto; }
.sui-repo-main { min-width:0; display:grid; align-content:start; gap:12px; }
.sui-repo-head { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.sui-repo-revision { flex:none; display:inline-flex; align-items:center; }
.sui-repo-trail { flex:1 1 auto; }
.sui-repo-actions { flex:none; display:flex; align-items:center; gap:8px; margin-left:auto; }
.sui-repo-summary { min-width:0; }
.sui-repo-content { min-width:0; display:grid; align-content:start; gap:16px; }
.sui-repo[data-size='inline'] .sui-repo-content { max-height:420px; overflow:auto; }
.sui-repo-box { min-width:0; border:1px solid ${t.border}; border-radius:${t.radius}; background:${t.card}; overflow:hidden; }
.sui-repo-toolbar { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:8px 14px; border-bottom:1px solid ${t.border}; color:${t.mutedForeground}; font-size:${t.fontSizeCompact}; }
.sui-repo-readme-name { color:${t.foreground}; font-weight:650; text-decoration:none; border-radius:${t.radiusControl}; }
.sui-repo-readme-name:hover { text-decoration:underline; }
.sui-repo-readme-name:focus-visible { ${focusRing} }
.sui-repo-stats { min-width:0; font-variant-numeric:tabular-nums; }
.sui-repo-file-actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
.sui-repo-segmented { display:inline-flex; padding:2px; gap:2px; border:1px solid ${t.border}; border-radius:${t.radiusControl}; background:${t.secondary}; }
.sui-repo-segment { padding:2px 10px; border:none; border-radius:4px; background:transparent; color:${t.mutedForeground}; font:inherit; font-size:${t.fontSizeCompact}; cursor:pointer; ${interaction} }
.sui-repo-segment:hover { color:${t.foreground}; }
.sui-repo-segment:focus-visible { ${focusRing} }
.sui-repo-segment[aria-pressed='true'] { background:${t.card}; color:${t.foreground}; font-weight:650; }
.sui-repo-note { padding:14px; color:${t.mutedForeground}; font-size:13px; }
.sui-repo-code { border-radius:0; }
@container (max-width: 719px) {
  .sui-repo[data-size='full'] > .sui-repo-layout { grid-template-columns:minmax(0, 1fr); }
  .sui-repo-side { display:none; }
}
`;

/** The package's sheet: the diff view's frame, the code view and the repository view. */
export const repoViewCss = `${pierreDiffCss}${codeViewCss}${repositoryCss}`;

/**
 * Marker attribute on the sheet's `<style>` element. The injection fallback
 * checks for it and stands down when {@link RepoViewStyles} already rendered
 * the sheet.
 */
export const REPO_VIEW_STYLE_ATTR = "data-smithers-repo-view";

/**
 * Renders the package's sheet in a `<style>` tag. Render it once near the
 * root, beside `@smthrs/ui`'s `SmithersUiStyles`, where effects never run:
 * server rendering and `renderToStaticMarkup`. In a browser every view also
 * injects it itself.
 */
export function RepoViewStyles() {
  // Literal attribute: JSX attribute names must be static; keep it equal to REPO_VIEW_STYLE_ATTR.
  return <style data-smithers-repo-view="">{repoViewCss}</style>;
}

/**
 * Browser fallback: appends the sheet to `<head>` once, unless a marked
 * `<style>` is already there. Server rendering never runs insertion effects,
 * so there it does nothing.
 */
export function useInjectRepoViewCss(): void {
  useInsertionEffect(() => {
    if (document.querySelector(`style[${REPO_VIEW_STYLE_ATTR}]`)) return;
    const element = document.createElement("style");
    element.setAttribute(REPO_VIEW_STYLE_ATTR, "");
    element.textContent = repoViewCss;
    document.head.appendChild(element);
  }, []);
}
