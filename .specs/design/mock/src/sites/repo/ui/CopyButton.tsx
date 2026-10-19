/* CopyButton(text, label?, small?) has a slash form and reports clipboard failure without claiming success. */
import { useEffect, useState } from "react"
import { Icon } from "../../app/lib"
import { toast } from "./Toast"
import { registerSlash } from "../frame/slash"

export const copyText = async (text: string) => {
  if (navigator.clipboard) await navigator.clipboard.writeText(text)
  else {
    const input = document.createElement("textarea")
    input.value = text; input.style.position = "fixed"; input.style.opacity = "0"
    document.body.appendChild(input)
    try {
      input.select()
      if (!document.execCommand("copy")) throw new Error("Clipboard unavailable. Select the text to copy it.")
    } finally { input.remove() }
  }
}
registerSlash("copy", {
  purpose: "Copy", access: "public", confirm: false,
  userOnly: "Your browser requires a click to copy text.",
  fields: [{ name: "text", label: "Text", type: "textarea" }],
  run: async ({ text }) => { await copyText(text); toast("Copied.") }
})
export const CopyButton = ({ text, label = "Copy", small = false, primary = false }: { text: string; label?: string; small?: boolean; primary?: boolean }) => {
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer) }, [copied])
  return <button type="button" className={`repo-ui-btn repo-ui-copy${primary ? " repo-ui-btn-primary" : ""}${small ? " repo-ui-copy-small" : ""}`} title={`/copy ${JSON.stringify(text)}`} onClick={async () => {
    try {
      await copyText(text)
      setCopied(true)
    } catch { toast("Clipboard unavailable. Select the command to copy it.") }
  }}><Icon name={copied ? "check" : "copy"} size={13}/>{copied ? "Copied" : label}</button>
}
