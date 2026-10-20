import { SmithersUiStyles } from "@smthrs/ui"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppProvider } from "./AppContext"
import { appLayer, boot } from "./boot"
import { makeRuntime } from "./lib/runtime"
import { router } from "./router"
import "./styles/fonts.css"

// The program's boundary. The app's one runtime is built here, and the boot program is the one Effect started here;
// actions and library callbacks run on this same runtime.
const runtime = makeRuntime(appLayer({ origin: window.location.origin }))
const root = createRoot(document.getElementById("root")!)

runtime.runFork(
  boot({
    target: window,
    startedAt: performance.timeOrigin,
    render: (chat) =>
      root.render(
        <StrictMode>
          <SmithersUiStyles withTheme />
          <AppProvider value={{ chat, run: runtime.runSync }}>
            <RouterProvider router={router} />
          </AppProvider>
        </StrictMode>,
      ),
  }),
)
