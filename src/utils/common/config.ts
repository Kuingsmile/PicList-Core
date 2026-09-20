/** Mutable list of configuration prefixes protected from runtime and persistent modifications. */
export const configBlackList: string[] = []

/** Checks prefix-based protection, so descendants of a blocked key are also protected. */
export const isConfigKeyInBlackList = (key: string): boolean => {
  return configBlackList.some(blackItem => key.startsWith(blackItem))
}

/** Checks for a nonempty object map rather than an array; callers must not pass null. */
export const isInputConfigValid = (config: any): boolean => {
  if (typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length > 0) {
    return true
  }
  return false
}

/** Parses JSON, returning an empty object when parsing fails. */
export function safeParse<T>(str: string): T | string {
  try {
    return JSON.parse(str)
  } catch (_e) {
    return JSON.parse('{}')
  }
}

/** Coerces a value to a number, replacing NaN with zero. */
export const forceNumber = (num: string | number = 0): number => {
  return isNaN(Number(num)) ? 0 : Number(num)
}

export const isDev = (): boolean => process.env.NODE_ENV === 'development'
