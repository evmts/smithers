import { AppShell } from "./AppShell"

// /app: the shell at once, from the device. No loading or lost-connection screen exists; the header's pill says when
// the device is offline.
export function AppScreen() {
  return <AppShell />
}
