export const isUrl = (url: string): boolean => /^https?:\/\//.test(url)

export const isUrlEncode = (url: string): boolean => {
  url = url || ''
  try {
    return url !== decodeURI(url)
  } catch (_e) {
    return false
  }
}

export const handleUrlEncode = (url: string): string => {
  if (!isUrlEncode(url)) {
    url = encodeURI(url)
  }
  return url
}
