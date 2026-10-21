import { LinkIntent } from "@smthrs/ui"
import { useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"

// A plain link's hover or focus preloads its page, as the router's own links do (`defaultPreload: "intent"`), after the
// router's own delay: the links @smthrs/ui draws (a file list, a README's, an issue list's, a home's) are plain anchors
// that navigate through the router on a plain click. `LinkIntent` waits for the pointer or focus to rest on the link.
export function IntentPreload({ children }: { readonly children: ReactNode }) {
  const router = useRouter()
  return (
    <LinkIntent delayMs={router.options.defaultPreloadDelay ?? 0} onIntent={(path) => void router.preloadRoute({ to: path })}>
      {children}
    </LinkIntent>
  )
}
