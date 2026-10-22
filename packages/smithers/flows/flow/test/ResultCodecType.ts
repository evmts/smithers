import type { Flow } from "@smthrs/flow"
import type { Schema } from "effect"

type Assert<A extends true> = A

// A JSON codec may encode any JSON value; declaring the encoded side as the
// decoded result union falsely promises an identity codec. In particular JSON
// null must remain assignable to the codec's encoded input type.
export type ResultCodecEncodedInput = Assert<
  Schema.Json extends typeof Flow.ResultEncoded["Encoded"] ? true : false
>
