---
"@smthrs/ui": minor
---

Adds `FileTabs`, a strip of open files above a code view: each tab links to its file and has a close button. It is a
tablist with no state of its own: ←, →, Home and End move between tabs, Enter or Space opens one (`onOpen`), and
Delete or Backspace closes it (`onClose`), focusing the tab that takes its place. A modified click keeps the browser's
behavior.

```tsx
<FileTabs
  tabs={[{ key: "src/app.ts", label: "app.ts", title: "src/app.ts", href: "/o/r/blob/main/src/app.ts", active: true }]}
  onOpen={(tab) => openFile(tab.key)}
  onClose={(tab) => closeFile(tab.key)}
/>
```
