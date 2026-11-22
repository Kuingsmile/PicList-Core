import { readFile } from 'node:fs/promises'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp, { type Gravity } from 'sharp'
import TextToSVG from 'text-to-svg'

import type { IBuildInWaterMarkOptions, ILogger } from '../../types'
import { forceNumber } from './config'
import { timePlaceholders } from './rename'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Expand known tokens once so braces and dollar signs in a filename remain literal. */
function watermarkText(template: string, fileName: string): string {
  const tokens = timePlaceholders(new Date())
  if (fileName) tokens['{filename}'] = () => path.parse(fileName).name
  return template.replace(/\{\w+\}/g, token => tokens[token]?.() ?? token)
}

function text2SVG(
  fontPath: string,
  text: string,
  color: string,
  fontSize: number,
  width: number,
  height: number,
): Buffer {
  const font = TextToSVG.loadSync(fontPath)
  const options: TextToSVG.GenerationOptions = {
    anchor: 'top',
    attributes: { fill: color },
  }
  if (fontSize > 0) {
    // Fit long captions and large type before rasterizing the SVG.
    const metrics = font.getMetrics(text, { fontSize: 1 })
    options.fontSize = Math.min(fontSize, width / metrics.width, height / metrics.height)
  }
  return Buffer.from(font.getSVG(text, options))
}

/** Locates the bundled watermark image from either the source utility layout or built module layout. */
const getDefaultWatermarkImagePath = (): string => {
  const commonUtilsDir = path.basename(__dirname) === 'common' ? path.dirname(__dirname) : __dirname
  return path.join(commonUtilsDir, 'assets', 'piclist.png')
}

/** Fallback image watermark resolved relative to this module's asset directory. */
const defaultWatermarkImagePath = getDefaultWatermarkImagePath()

/**
 * Places a scaled text or image watermark on every frame, optionally tiling it.
 *
 * @param img - Encoded source image bytes.
 * @param watermarkType - Selects generated text or an image file.
 * @param defaultWatermarkFontPath - Font file used when no custom text font is supplied.
 * @param isFullScreenWatermark - Tiles the watermark instead of placing it once.
 * @param watermarkDegree - Rotation angle in degrees.
 * @param text - Watermark text; empty values use the built-in sample text.
 * @param watermarkFontPath - Optional custom font file.
 * @param watermarkScaleRatio - Watermark width relative to image width; invalid values fall back to
 * 0.15.
 * @param watermarkColor - Text fill color accepted by the SVG renderer.
 * @param watermarkImagePath - Image watermark file; omitted to use the bundled logo.
 * @param position - Composite gravity, defaulting to southeast.
 * @param watermarkImageOpacity - Image watermark alpha on a 0–255 scale.
 * @param watermarkFontSize - Text size in pixels. Zero uses proportional scaling.
 * @param fileName - Original input name for the filename placeholder.
 */
export async function AddWatermark(
  img: Buffer,
  watermarkType: 'text' | 'image',
  defaultWatermarkFontPath: string,
  isFullScreenWatermark?: boolean,
  watermarkDegree?: number,
  text?: string,
  watermarkFontPath?: string,
  watermarkScaleRatio?: number,
  watermarkColor?: string,
  watermarkImagePath?: string,
  position?: Gravity,
  watermarkImageOpacity?: number,
  watermarkFontSize?: number,
  fileName = '',
): Promise<Buffer> {
  return renderWatermark(
    img,
    {
      watermarkType,
      isFullScreenWatermark,
      watermarkText: text,
      watermarkFontPath,
      watermarkScaleRatio,
      watermarkColor,
      watermarkImagePath,
      watermarkDegree,
      watermarkImageOpacity,
      watermarkFontSize,
    },
    defaultWatermarkFontPath,
    fileName,
    position,
  )
}

async function renderWatermark(
  img: Buffer,
  options: IBuildInWaterMarkOptions,
  defaultFont: string,
  fileName: string,
  position: Gravity | undefined = options.watermarkPosition,
): Promise<Buffer> {
  const image = sharp(img, { animated: true })
  const { width: imgWidth = 200, height = 200, pageHeight } = await image.metadata()
  const imgHeight = pageHeight || height
  const watermark = await createWatermark(options, defaultFont, imgWidth, imgHeight, fileName)
  const gravity = position || 'southeast'
  if (!options.isFullScreenWatermark && imgHeight < height) {
    // Sharp stacks animation frames vertically. Anchor the mark within one frame and repeat it down the stack.
    const { data, info } = await sharp({
      create: { width: imgWidth, height: imgHeight, channels: 4, background: 'transparent' },
    })
      .composite([{ input: watermark, gravity }])
      .raw()
      .toBuffer({ resolveWithObject: true })
    return await image.composite([{ input: data, raw: info, tile: true, gravity: 'northwest' }]).toBuffer()
  }
  return await image.composite([{ input: watermark, gravity, tile: options.isFullScreenWatermark }]).toBuffer()
}

/** Builds text or image watermark bytes, applies image opacity, and scales and rotates the result. */
async function createWatermark(
  options: IBuildInWaterMarkOptions,
  defaultWatermarkFontPath: string,
  imgWidth: number,
  imgHeight: number,
  fileName: string,
): Promise<Buffer> {
  let watermark: Buffer
  const fontSize = options.watermarkType === 'image' ? 0 : forceNumber(options.watermarkFontSize)
  if (options.watermarkType === 'image') {
    const opacity = Math.max(0, Math.min(255, Math.round(forceNumber(options.watermarkImageOpacity ?? 255))))
    // Read via Node so Electron can resolve assets stored inside app.asar.
    // libvips opens filename inputs directly and cannot read ASAR virtual paths.
    watermark = await sharp(await readFile(options.watermarkImagePath || defaultWatermarkImagePath))
      .composite([
        {
          input: Buffer.from([255, 255, 255, opacity]),
          raw: {
            width: 1,
            height: 1,
            channels: 4,
          },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .toBuffer()
  } else {
    watermark = text2SVG(
      options.watermarkFontPath || defaultWatermarkFontPath,
      watermarkText(options.watermarkText || '测试', fileName),
      options.watermarkColor || 'rgba(204, 204, 204, 0.45)',
      fontSize,
      imgWidth,
      imgHeight,
    )
  }
  const overlay = sharp(watermark)
  if (fontSize <= 0) {
    const { width, height } = await getSize(watermark)
    const ratio = forceNumber(options.watermarkScaleRatio)
    const targetWidth = Math.max(1, Math.floor(imgWidth * (ratio > 0 && ratio <= 1 ? ratio : 0.15)))
    overlay.resize(targetWidth, Math.max(1, Math.floor((targetWidth * height) / width)), { fit: 'inside' })
  }
  const rotatedWatermark = await overlay
    .rotate(forceNumber(options.watermarkDegree), {
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .toBuffer()
  // Rotation and tall logos may exceed the source frame; keep the composite inside its bounds.
  const rotatedSize = await getSize(rotatedWatermark)
  if (rotatedSize.width <= imgWidth && rotatedSize.height <= imgHeight) return rotatedWatermark
  return await sharp(rotatedWatermark)
    .resize(imgWidth, imgHeight, { fit: 'inside', withoutEnlargement: true })
    .toBuffer()
}

/** Draw one checked preset per image. An empty pool skips watermarking. */
export function selectWatermark(options: IBuildInWaterMarkOptions): IBuildInWaterMarkOptions | undefined {
  if (!options.randomWatermark) return options
  if (!Array.isArray(options.watermarkPresets)) return undefined
  const pool = options.watermarkPresets.filter(
    preset => preset?.enabled === true && (preset.watermarkType === 'text' || preset.watermarkType === 'image'),
  )
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Reads watermark dimensions, using 200 pixels for each unavailable dimension. */
async function getSize(image: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(image).metadata()
  return { width: width || 200, height: height || 200 }
}

/** Applies configured watermark settings, logging failures and returning the original bytes on error. */
export async function imageAddWaterMark(
  img: Buffer,
  options: IBuildInWaterMarkOptions,
  defaultWatermarkFontPath: string,
  logger: ILogger,
  fileName = '',
): Promise<Buffer> {
  try {
    const selected = selectWatermark(options)
    if (!selected) return img
    return await renderWatermark(img, selected, defaultWatermarkFontPath, fileName)
  } catch (error: any) {
    logger.error(`Image add watermark error: ${error}`)
    return img
  }
}
