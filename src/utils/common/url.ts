export const isUrl = (url: string): boolean => /^https?:\/\//.test(url)

/** Detects URI escapes that decodeURI changes, returning false for malformed escape sequences. */
export const isUrlEncode = (url: string): boolean => {
  url = url || ''
  try {
    return url !== decodeURI(url)
  } catch (_e) {
    return false
  }
}

/** Applies encodeURI only when the URL does not already contain detectable URI escapes. */
export const handleUrlEncode = (url: string): string => {
  if (!isUrlEncode(url)) {
    url = encodeURI(url)
  }
  return url
}
