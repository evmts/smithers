// A-1/B-4: synchronous decoding preserves URIError on malformed span ids.
export const decodeSpanId = (value: string): string => decodeURIComponent(value)
