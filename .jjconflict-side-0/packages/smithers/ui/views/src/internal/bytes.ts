/**
 * UTF-8 sizes, without a host encoder.
 *
 * @since 0.1.0
 * @private
 */

/**
 * The UTF-8 length of a string. A lone surrogate counts three bytes, as the
 * replacement character `TextEncoder` writes for it.
 *
 * @since 0.1.0
 * @private
 */
export const utf8Length = (text: string): number => {
  let bytes = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index++
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

/**
 * The UTF-8 length of a value's JSON, or `undefined` when it has none: a cycle,
 * a `BigInt`, or a top-level value JSON drops, such as a function.
 *
 * @since 0.1.0
 * @private
 */
export const jsonLength = (value: unknown): number | undefined => {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? undefined : utf8Length(json)
  } catch {
    return undefined
  }
}
