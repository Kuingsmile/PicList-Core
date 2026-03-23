import { IImgInfo, IPicGo } from '../../types'

export function getImageBuffer(img: IImgInfo): Buffer | undefined {
  if (img.buffer) return img.buffer
  if (img.base64Image) return Buffer.from(img.base64Image, 'base64')
  return
}

export function getAndCheckConfig<T extends Record<string, any>>(
  ctx: IPicGo,
  picBedKey: string,
  requiredKeys: string[],
): T {
  const config = ctx.getConfig<T>(picBedKey)
  if (!config) {
    throw new Error(`Can not find ${picBedKey} config!`)
  }
  for (const key of requiredKeys) {
    console.log(`Checking config key: ${key}, value: ${config[key]}`)
    if (!(key in config) || (typeof config[key] === 'string' && !config[key]?.trim())) {
      throw new Error(`Missing required config option: ${key}`)
    }
  }
  return config
}
