import { FilesProvider } from "../features/files/components/FilesContext"
import type { FilesView } from "../features/files/files"
// Render the real branch screen for router integration tests; React stays in the view adapter.
import { Match, RouterContextProvider } from "@tanstack/react-router"
import { renderToStaticMarkup } from "react-dom/server"
import type { router, RouterContext } from "../router"
import type { ChatView } from "../features/chat/chat"
import type { AuthView } from "../features/auth/auth"
import type { AttentionView } from "../features/attention/attention"
import type { StatusView } from "../features/status/status"
import type { CommandsView } from "../features/commands/commands"
import type { ThemeView } from "../features/theme/theme"
import type { SpendView } from "../features/spend/spend"
import { ChatProvider } from "../AppContext"
import { AttentionProvider } from "../features/attention/components/AttentionContext"
import { AuthProvider } from "../features/auth/components/AuthContext"
import { BranchProvider } from "../features/branch/components/BranchContext"
import { CommandsProvider } from "../features/commands/components/CommandsContext"
import { RepoProvider } from "../features/repo/components/RepoContext"
import { SpendProvider } from "../features/spend/components/SpendContext"
import { StatusProvider } from "../features/status/components/StatusContext"
import { ThemeProvider } from "../features/theme/components/ThemeButton"
import { TerminalProvider } from "../features/terminal/components/TerminalContext"

export const renderTerminalScreen = (
  appRouter: typeof router,
  context: RouterContext,
  views: {
    readonly files: FilesView
    readonly chat: ChatView
    readonly auth: AuthView
    readonly attention: AttentionView
    readonly status: StatusView
    readonly commands: CommandsView
    readonly spend: SpendView
  },
  theme: ThemeView,
): string => {
  return renderToStaticMarkup(
    <RouterContextProvider router={appRouter}>
      <ChatProvider value={views.chat}>
        <AuthProvider value={views.auth}>
          <AttentionProvider value={views.attention}>
            <SpendProvider value={views.spend}>
              <StatusProvider value={views.status}>
                <CommandsProvider value={views.commands}>
                  <RepoProvider value={context.repo}>
                    <BranchProvider value={context.branch}>
                      <ThemeProvider value={theme}>
                        <TerminalProvider value={context.terminal}>
                          <FilesProvider value={views.files}><Match routeId="/$owner/$repo/tree/$ref/$" /></FilesProvider>
                        </TerminalProvider>
                      </ThemeProvider>
                    </BranchProvider>
                  </RepoProvider>
                </CommandsProvider>
              </StatusProvider>
            </SpendProvider>
          </AttentionProvider>
        </AuthProvider>
      </ChatProvider>
    </RouterContextProvider>,
  )
}
