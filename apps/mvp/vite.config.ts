import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// In dev, /api goes to the Worker running under `pnpm dev:worker`.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8790" } },
})
