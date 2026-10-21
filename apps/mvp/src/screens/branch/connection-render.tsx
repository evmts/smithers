import { createElement, type ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RouterProvider } from "@tanstack/react-router"
import { ChatProvider } from "../../AppContext"
import { AttentionProvider } from "../../features/attention/components/AttentionContext"
import { RepoProvider } from "../../features/repo/components/RepoContext"
type Services = {
  chat: ComponentProps<typeof ChatProvider>["value"]
  repo: ComponentProps<typeof RepoProvider>["value"]
  attention: ComponentProps<typeof AttentionProvider>["value"]
}
export const renderConnection = (router: ComponentProps<typeof RouterProvider>["router"], { chat, repo, attention }: Services) =>
  renderToStaticMarkup(
    createElement(ChatProvider, { value: chat },
      createElement(RepoProvider, { value: repo },
        createElement(AttentionProvider, { value: attention }, createElement(RouterProvider, { router })))),
  )
