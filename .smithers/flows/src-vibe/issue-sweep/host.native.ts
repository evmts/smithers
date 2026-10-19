// E-7: the Node platform reads host.vibe's plain values make (EK4402). One call each.
import { homedir as nodeHomedir } from "node:os"

export const homedir = (): string => nodeHomedir()
