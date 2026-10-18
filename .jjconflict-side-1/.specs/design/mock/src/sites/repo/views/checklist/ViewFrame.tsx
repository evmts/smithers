import { useEffect, type ComponentProps } from "react"
import { useLocation } from "../../../core/router"
import { repo } from "../../fixtures"
import { registerSlash, RepoFrame } from "../../frame"
import { getSlash, type RegisteredSlash } from "../../frame/slash"

/** A title is also the declaration of a view-local action. Typed commands take precedence.
 * These fallback doors activate the actual control, including its form validation and access gate.
 * Observing only the view keeps Ask's own confirmation buttons out of the registry. */
export const buttonCommand = (title: string) => {
  const match = title.match(/(?:^| · )(\/[\w.-]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null
  return { name: match[1], target: (match[1] === "/copy" ? match[2] ?? "" : (match[2] ?? "").split(/\n| · /)[0]).trim() }
}

const ViewCommands = () => {
  const location = useLocation()
  useEffect(() => {
    const root = document.getElementById("repo-content")
    if (!root) return
    const owned = new Map<string, { signature: string; entry: RegisteredSlash; off: () => void }>()
    const controls = () => [...root.querySelectorAll<HTMLElement>("button[title], summary[title], a[title], input[type=checkbox][title]")]
      .flatMap(element => {
        const command = buttonCommand(element.title)
        return command ? [{ ...command, element }] : []
      })
    const refresh = () => {
      const groups = new Map<string, ReturnType<typeof controls>>()
      for (const control of controls()) groups.set(control.name, [...(groups.get(control.name) ?? []), control])
      for (const [name, value] of owned) {
        if (!groups.has(name)) { value.off(); owned.delete(name) }
      }
      for (const [name, items] of groups) {
        const previous = owned.get(name)
        if (getSlash(name) && getSlash(name) !== previous?.entry) continue
        const targets = [...new Set(items.map(item => item.target))]
        const signature = JSON.stringify(targets)
        if (previous?.signature === signature) continue
        previous?.off()
        const off = registerSlash(name, {
          purpose: items[0].element.getAttribute("aria-label") ?? items[0].element.textContent?.trim() ?? name.slice(1),
          access: "public", confirm: false,
          fields: targets.some(Boolean) ? [{ name: "target", label: "Target", required: targets.length > 1 && !targets.includes(""), options: targets }] : [],
          run: ({ target }, context) => {
            // Re-read after edits, tab changes, or a form opening; never retain a detached control.
            const candidates = controls().filter(item => item.name === name && item.target === (target || (targets.length === 1 ? targets[0] : "")))
            // A save/confirm button replaces its opener once that form is open.
            const control = [...candidates].reverse().find(item => item.element.closest("form") && item.element.tagName === "BUTTON" && (item.element as HTMLButtonElement).type === "submit")
              ?? candidates.at(-1)
            if (!control) return
            const element = control.element
            const form = element.closest("form")
            if (element.matches(":disabled, [aria-disabled=true]")) {
              const reason = element.getAttribute("aria-describedby")?.split(/\s+/).map(id => document.getElementById(id)?.textContent).filter(Boolean).join(" ")
              if (reason) throw new Error(reason)
              if (context.flags.as === "in" && context.flags.role === "reader" && !form) throw new Error(`Only members of ${repo.slug} can perform this action.`)
              context.closeAsk()
              form?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus()
              form?.reportValidity()
              return
            }
            context.closeAsk()
            for (let ancestor = element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
              if (ancestor.tagName === "DETAILS") (ancestor as HTMLDetailsElement).open = true
            }
            element.click()
          }
        })
        owned.set(name, { signature, entry: getSlash(name)!, off })
      }
    }
    refresh()
    const observer = new window.MutationObserver(refresh)
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["title", "disabled", "aria-disabled"] })
    return () => { observer.disconnect(); owned.forEach(value => value.off()) }
  }, [location])
  return null
}

export const ViewFrame = ({ children, ...props }: ComponentProps<typeof RepoFrame>) => (
  <RepoFrame {...props}>{children}<ViewCommands /></RepoFrame>
)
