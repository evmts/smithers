/** Personal pin write and Electric shape; neither accepts a person's id from the caller. */
export const PIN_ROUTE = "/api/message-pin"
export const PINS_SHAPE_ROUTE = "/api/shapes/message-pins"
export const PINS_TABLE = "message_pins"
export const PINS_TELEMETRY = {
  records: ["chat.pin", "chat.pin.post", "smithers_message_pins"],
  fields: ["errorCode", "outcome", "status", "durationMs", "conversationId", "feature"],
} as const
