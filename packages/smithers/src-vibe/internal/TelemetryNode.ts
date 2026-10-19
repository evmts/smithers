// E-7 (EK4402): performance.timeOrigin is a platform read that VibeLang code
// does not make directly. Telemetry.vibe's process start-up clock counts from
// it, exactly as Telemetry.ts does.

/** The runtime's own time origin, in epoch milliseconds. */
export const processTimeOrigin = (): number => performance.timeOrigin
