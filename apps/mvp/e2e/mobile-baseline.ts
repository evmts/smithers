import { expect, type Page, type TestInfo } from "@playwright/test"

// The added rules relative to main 9dd5d9d0. Removing exactly these rules inside
// the rendered stylesheets reconstructs the baseline CSS on the same live DOM.
// Paired screenshots avoid random TODO ids, timestamps and synced data changing
// between two server runs. Both PNGs are retained; no content is masked.
const addedRules = [
  ".app-shell-header { flex-wrap: wrap; }",
  ".app-shell-header [aria-label=\"Account\"] { min-width: 0; flex-wrap: wrap; }",
  ".app-shell-nav { flex-wrap: wrap; }",
  ".app-shell-nav > a { display: inline-flex; align-items: center; min-width: 32px; min-height: 32px; }",
  ".branch-header-views > a { display: inline-flex; align-items: center; min-width: 32px; min-height: 32px; }",
  ".branch-header-presence { flex-wrap: wrap; min-width: 0; }",
  ".docs-page-links a { display:flex; align-items:center; min-width:32px; min-height:32px; }",
  ".flows-screen-header > a { display:inline-flex; align-items:center; min-height:32px; min-width:32px; }",
  ".flows-page td a { display:inline-flex; align-items:center; min-height:32px; min-width:32px; max-width:100%; overflow-wrap:anywhere; }",
  ".plugin-screen-header > a { display:inline-flex; align-items:center; min-height:32px; min-width:32px; }",
  ".repo-header-name a { display: inline-flex; align-items: center; min-height: 32px; }",
  ".repo-screen:has(.repo-header-bell) ~ .root-bell { display:none; }",
  ".runs-screen-header > a { display:inline-flex; align-items:center; min-height:32px; min-width:32px; }",
  ".settings-screen-header > a { display:inline-flex; align-items:center; min-height:32px; min-width:32px; }",
  ".sui-markdown-editor[data-readonly] .ProseMirror a { display:inline-block; min-width:32px; min-height:32px; line-height:32px; max-width:100%; overflow-wrap:anywhere; }",
  ".sui-repo-readme-name { display:inline-flex; align-items:center; min-height:var(--ctl-h, 32px); }",
  ".sui-action-menu-trigger { width:32px; min-height:var(--ctl-h, 32px); height:var(--ctl-h, 32px); }",
  "button.sui-toast-open { min-height:var(--ctl-h, 32px); }",
  ".sui-toast-text, .sui-notification-text { white-space:normal; overflow-wrap:anywhere; }",
  ".sui-notification-bell { flex-shrink:0; }",
  ".sui-notification-count { position:static; flex:none; }",
  ".sui-notification-bell:has(.sui-notification-count) { width:auto; padding-inline:8px; }",
  ".sui-timeline-disclosure>summary {min-width:32px;min-height:var(--ctl-h, 32px);box-sizing:border-box;display:flex;align-items:center}",
  ".sui-flow-draft-file-path { min-height:var(--ctl-h, 32px); box-sizing:border-box; }",
  ".sui-flow-graph-tools { position:static; width:max-content; max-width:100%; margin:8px; }",
  ".sui-journal-scrubber input { min-height:var(--ctl-h, 32px); }",
  ".sui-issues-filter { min-height:var(--ctl-h, 32px); min-width:32px; }",
  ".sui-issues-link, .sui-issues-meta-link { display:inline-flex; align-items:center; min-height:var(--ctl-h, 32px); min-width:32px; }",
  ".sui-json-value-summary { min-height:var(--ctl-h, 32px); box-sizing:border-box; }",
  ".sui-breadcrumbs-link { display:inline-flex; align-items:center; min-height:var(--ctl-h, 32px); min-width:32px; }",
  ".sui-repo-about-people a { display:flex; align-items:center; justify-content:center; min-width:32px; min-height:var(--ctl-h, 32px); }",
  ".sui-run-list-flow a { display:inline-flex; align-items:center; min-height:var(--ctl-h, 32px); min-width:32px; }",
  "button.sui-waterfall-track { min-height:var(--ctl-h, 32px); }",
  "button.sui-avatar { min-width:32px; min-height:var(--ctl-h, 32px); }",
  ".sui-avatar-stack { flex-wrap:wrap; gap:4px; }",
  ".sui-avatar-stack > li + li { margin-left:0; }",
  ".sui-button { min-width:32px; min-height:var(--ctl-h, 32px); white-space:normal; }",
  ".sui-chat-composer-input { min-height:var(--ctl-h, 32px); }",
  ".sui-md-link { display:inline-block; min-width:32px; min-height:var(--ctl-h, 32px); line-height:var(--ctl-h, 32px); max-width:100%; overflow-wrap:anywhere; }",
  ".sui-codeblock-action { min-height:var(--ctl-h, 32px); min-width:32px; }"
]

export const desktopBaseline = async (page: Page, info: TestInfo, name: string) => {
  await expect(async () => {
    const content = await page.locator("body").innerText()
    const current = await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" })
    const removed = await page.evaluate((rules) => {
      const key = (rule: CSSStyleRule) => rule.cssText
      const added = new Set(rules.map((css) => {
        const sheet = new CSSStyleSheet()
        sheet.replaceSync(css)
        return key(sheet.cssRules[0] as CSSStyleRule)
      }))
      const undo: Array<() => void> = []
      const visit = (parent: CSSStyleSheet | CSSGroupingRule) => {
        for (let i = parent.cssRules.length - 1; i >= 0; i--) {
          const rule = parent.cssRules[i]!
          if (rule instanceof CSSStyleRule && added.has(key(rule))) {
            const css = rule.cssText
            parent.deleteRule(i)
            undo.unshift(() => parent.insertRule(css, i))
          } else if (rule instanceof CSSGroupingRule) {
            visit(rule)
          }
        }
      }
      for (const sheet of document.styleSheets) visit(sheet)
      ;(window as unknown as { restoreMobileStyles: () => void }).restoreMobileStyles = () => undo.forEach((restore) => restore())
      return undo.length
    }, [...addedRules])
    try {
      expect(removed, "baseline must remove the sweep's actual CSS rules").toBeGreaterThan(0)
      const baseline = await page.screenshot({ path: info.outputPath(`${name}-baseline.png`), fullPage: true, animations: "disabled" })
      expect(current.equals(baseline), "desktop screenshot must equal the baseline CSS on the same page").toBe(true)
    } finally {
      await page.evaluate(() => (window as unknown as { restoreMobileStyles: () => void }).restoreMobileStyles())
    }
    expect(await page.locator("body").innerText(), "content must remain stable across the CSS comparison").toBe(content)
  }).toPass({ timeout: 10_000 })
}
