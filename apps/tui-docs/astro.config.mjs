import { defineConfig } from "astro/config"
/**
 * tui.smithers.sh serves the browser playground. Former product guide URLs redirect to the Mac install page.
 */
export default defineConfig({
  site: "https://tui.smithers.sh",
  redirects: {
    "/installation/": "https://smithers.sh/docs/installation/",
    "/guides/fix-a-bug/": "https://smithers.sh/docs/installation/",
    "/guides/chat/": "https://smithers.sh/docs/installation/",
    "/guides/sessions/": "https://smithers.sh/docs/installation/",
    "/guides/shell/": "https://smithers.sh/docs/installation/",
    "/guides/search/": "https://smithers.sh/docs/installation/",
    "/guides/background-work/": "https://smithers.sh/docs/installation/",
    "/guides/review-changes/": "https://smithers.sh/docs/installation/",
    "/guides/time-travel/": "https://smithers.sh/docs/installation/",
    "/guides/models/": "https://smithers.sh/docs/installation/",
    "/guides/approvals/": "https://smithers.sh/docs/installation/",
    "/guides/appearance/": "https://smithers.sh/docs/installation/",
    "/guides/estimates/": "https://smithers.sh/docs/installation/",
    "/automation/flows/": "https://smithers.sh/docs/installation/",
    "/automation/agents/": "https://smithers.sh/docs/installation/",
    "/automation/views/": "https://smithers.sh/docs/installation/",
    "/automation/extensions/": "https://smithers.sh/docs/installation/",
    "/automation/monitors/": "https://smithers.sh/docs/installation/",
    "/reference/commands/": "https://smithers.sh/docs/installation/",
    "/reference/keys/": "https://smithers.sh/docs/installation/",
    "/reference/cli/": "https://smithers.sh/docs/installation/",
    "/reference/configuration/": "https://smithers.sh/docs/installation/",
    "/reference/troubleshooting/": "https://smithers.sh/docs/installation/",
    "/reference/recordings/": "https://github.com/smithersai/smithers/blob/main/apps/tui/docs/README.md"
  },
  // Serve only this app, the workspace packages it imports, and installed dependencies; never the whole checkout.
  vite: {
    server: { fs: { allow: [".", "../../packages/smithers", "../../node_modules"] } },
    optimizeDeps: { exclude: ["@smthrs/agent", "@smthrs/harness"] }
  }
})
