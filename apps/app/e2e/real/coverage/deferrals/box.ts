// Box choice resumes a host-backed act; real-host coverage remains owed in #2327.
export const box = [
  "box.desktop", // owner: #1879
  "box.desktop.open", // owner: #1879
  "box.desktop.rotate", // owner: #1879
  "box.desktop.stop", // owner: #1879
  "box.images", // owner: #1879
  "box.list", // owner: #1879
  "box.session.destroy", // owner: #1879
  "box.select", // owner: #2327
] as const
