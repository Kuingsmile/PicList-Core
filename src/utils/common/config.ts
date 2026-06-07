export const configBlackList: string[] = []

export const isConfigKeyInBlackList = (key: string): boolean => {
  return configBlackList.some(blackItem => key.startsWith(blackItem))
}

export const isInputConfigValid = (config: any): boolean => {
  if (typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length > 0) {
    return true
  }
  return false
}

export function safeParse<T>(str: string): T | string {
  try {
    return JSON.parse(str)
  } catch (_e) {
    return JSON.parse('{}')
  }
}

export const forceNumber = (num: string | number = 0): number => {
  return isNaN(Number(num)) ? 0 : Number(num)
}

export const isDev = (): boolean => process.env.NODE_ENV === 'development'
