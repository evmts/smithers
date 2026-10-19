import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Alchemy injects the Cloudflare plugin, which runs worker/index.ts beside the app in dev and build.
export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: { port: 5190, strictPort: true, fs: { strict: false } },
  build: { target: "esnext" },
})
