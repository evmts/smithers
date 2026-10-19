// E-7 (EK4402): Buffer is a Node platform API; ServiceSupervisor.vibe decodes the captured
// command output through this helper exactly where ServiceSupervisor.ts calls Buffer.concat.
/** `Buffer.concat(chunks).toString("utf8")`. */
export const utf8 = (chunks) => Buffer.concat(chunks).toString("utf8");
