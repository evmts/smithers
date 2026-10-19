import { SmithersUiStyles } from "@smthrs/ui"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { router } from "./router"
import "./styles/fonts.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SmithersUiStyles withTheme />
    <RouterProvider router={router} />
  </StrictMode>,
)
