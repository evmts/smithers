import { createElement, type ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RouterProvider } from "@tanstack/react-router"
import { ChatProvider } from "../../AppContext"
import { AttentionProvider } from "../../features/attention/components/AttentionContext"
import { AuthProvider } from "../../features/auth/components/AuthContext"
import { RepoProvider } from "../../features/repo/components/RepoContext"
type Services = {
  auth: ComponentProps<typeof AuthProvider>["value"]
  chat: ComponentProps<typeof ChatProvider>["value"]
  repo: ComponentProps<typeof RepoProvider>["value"]
  attention: ComponentProps<typeof AttentionProvider>["value"]
}
export const renderConnection = (router: ComponentProps<typeof RouterProvider>["router"], { chat, repo, attention, auth }: Services) =>
  renderToStaticMarkup(
    createElement(AuthProvider, { value: auth },
      createElement(ChatProvider, { value: chat },
        createElement(RepoProvider, { value: repo },
          createElement(AttentionProvider, { value: attention }, createElement(RouterProvider, { router }))))),
  )
