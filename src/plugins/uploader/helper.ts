import { IImgInfo, IPicGo } from '../../types'

/**
 * Returns existing image bytes or decodes base64 content, yielding undefined when no payload is
 * present.
 */
export function getImageBuffer(img: IImgInfo): Buffer | undefined {
  if (img.buffer) return img.buffer
  if (img.base64Image) return Buffer.from(img.base64Image, 'base64')
  return
}

/**
 * Loads uploader settings and checks required keys for presence and nonblank string values.
 *
 * @throws If the configuration is absent or a required key is missing or a blank string.
 */
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
    if (!(key in config) || (typeof config[key] === 'string' && !config[key]?.trim())) {
      throw new Error(`Missing required config option: ${key}`)
    }
  }
  return config
}
