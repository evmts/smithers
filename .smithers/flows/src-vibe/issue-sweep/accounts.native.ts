// E-7: the Node platform reads accounts.vibe's plain values make (EK4402). One read each.
export const env = (name: string): string | undefined => process.env[name]
