export const isUrl = (url: string): boolean => /^https?:\/\//i.test(url)

/** Detects an existing percent-encoded byte; the rest of the URL may still contain raw text. */
export const isUrlEncode = (url: string): boolean => /%[\dA-Fa-f]{2}/.test(url || '')

/**
 * Encodes raw Unicode, spaces, and other characters outside the URI alphabet as UTF-8 escapes.
 * Existing %HH bytes (including their casing) and reserved URL delimiters remain unchanged, so
 * signed queries retain their ordering, duplicate parameters, plus signs, and escape spelling.
 * Bare or malformed percent signs become %25; escaped bytes need not form valid UTF-8.
 *
 * This encodes URL text without parsing/reserializing it or resolving paths. A literal percent
 * followed by two hex digits must already be written as %25 to distinguish it from an escape.
 * @throws URIError for unpaired UTF-16 surrogates, which cannot be encoded losslessly as UTF-8.
 */
export const handleUrlEncode = (url: string): string => {
  // Match existing escapes first, then characters outside RFC 3986's unreserved/reserved sets.
  // The Unicode flag keeps surrogate pairs together; brackets remain intact for IPv6 hosts.
  return url.replace(/%[\dA-Fa-f]{2}|[^A-Za-z\d._~:/?#[\]@!$&'()*+,;=-]/gu, token =>
    token.startsWith('%') && token.length === 3 ? token : encodeURIComponent(token),
  )
}
