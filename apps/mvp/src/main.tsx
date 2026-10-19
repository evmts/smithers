import { StoreRegistryProvider } from "@livestore/react"
import { SmithersUiStyles } from "@smthrs/ui"
import { RouterProvider } from "@tanstack/react-router"
import { Effect } from "effect"
import { StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { boot } from "./boot"
import { storeRegistry } from "./livestore/store"
import { router } from "./router"
import "./styles/fonts.css"

// The program's boundary: the one place the app runs an Effect.
Effect.runFork(boot)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SmithersUiStyles withTheme />
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <Suspense>
        <RouterProvider router={router} />
      </Suspense>
    </StoreRegistryProvider>
  </StrictMode>,
)
