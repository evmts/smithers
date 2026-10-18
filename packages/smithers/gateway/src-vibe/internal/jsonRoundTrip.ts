// A-1/B-4: a plain synchronous JSON conversion preserves thrown parse/encoding failures.
export const roundTrip = (value: unknown): any => JSON.parse(JSON.stringify(value))
