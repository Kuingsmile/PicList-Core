import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'
import TextToSVG from 'text-to-svg'

import type { IBuildInWaterMarkOptions, ILogger } from '../../types'
import { forceNumber } from './config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Renders watermark text as SVG bytes using the selected font file and fill color. */
async function text2SVG(
  defaultWatermarkFontPath: string,
  text?: string,
  color?: string,
  fontFamily?: string,
): Promise<Buffer> {
  text = !text ? '测试' : text
  fontFamily = !fontFamily ? defaultWatermarkFontPath : fontFamily
  color = !color ? 'rgba(204, 204, 204, 0.45)' : color
  const text2SVG = TextToSVG.loadSync(fontFamily)
  const options: TextToSVG.GenerationOptions = {
    anchor: 'top',
    attributes: {
      fill: color,
    },
  }
  const textSVG = text2SVG.getSVG(text, options)
  return Buffer.from(textSVG)
}

/** Locates the bundled watermark image from either the source utility layout or built module layout. */
const getDefaultWatermarkImagePath = (): string => {
  const commonUtilsDir = path.basename(__dirname) === 'common' ? path.dirname(__dirname) : __dirname
  return path.join(commonUtilsDir, 'assets', 'piclist.png')
}

/** Fallback image watermark resolved relative to this module's asset directory. */
const defaultWatermarkImagePath = getDefaultWatermarkImagePath()

/**
 * Composites a scaled text or image watermark, optionally tiled across every frame.
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
  position?: sharp.Gravity,
  watermarkImageOpacity?: number,
): Promise<Buffer> {
  watermarkScaleRatio =
    !watermarkScaleRatio || watermarkScaleRatio < 0 || watermarkScaleRatio > 1 ? 0.15 : watermarkScaleRatio
  const image = sharp(img, { animated: true })
  const { width: imgWidth = 200 } = await image.metadata()
  const watermark = await createWatermark(
    watermarkType,
    defaultWatermarkFontPath,
    text,
    watermarkFontPath,
    watermarkScaleRatio,
    watermarkColor,
    watermarkImagePath,
    imgWidth,
    watermarkDegree,
    watermarkImageOpacity,
  )
  return await image
    .composite([
      {
        input: watermark,
        gravity: position || 'southeast',
        tile: isFullScreenWatermark,
      },
    ])
    .toBuffer()
}

/** Builds text or image watermark bytes, applies image opacity, and scales and rotates the result. */
async function createWatermark(
  watermarkType: 'text' | 'image',
  defaultWatermarkFontPath: string,
  text?: string,
  watermarkFontPath?: string,
  watermarkScaleRatio?: number,
  watermarkColor?: string,
  watermarkImagePath?: string,
  imgWidth: number = 200,
  watermarkDegree: number = 0,
  watermarkImageOpacity: number = 255,
): Promise<Buffer> {
  let watermark: any
  if (watermarkType === 'image') {
    watermarkImageOpacity = forceNumber(watermarkImageOpacity)
    watermarkImagePath = watermarkImagePath || defaultWatermarkImagePath
    watermark = await sharp(watermarkImagePath)
      .composite([
        {
          input: Buffer.from([255, 255, 255, watermarkImageOpacity > 255 ? 255 : watermarkImageOpacity]),
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
    watermark = await text2SVG(
      defaultWatermarkFontPath,
      text,
      watermarkColor,
      watermarkFontPath || defaultWatermarkFontPath,
    )
  }
  const { width: watermarkWidth, height: watermarkHeight } = await getSize(watermark)
  const watermarkResizeWidth = Math.floor(imgWidth * forceNumber(watermarkScaleRatio))
  const watermarkResizeHeight = Math.floor((watermarkResizeWidth * watermarkHeight) / watermarkWidth)
  return await sharp(watermark)
    .resize(watermarkResizeWidth, watermarkResizeHeight, {
      fit: 'inside',
    })
    .rotate(watermarkDegree, {
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .toBuffer()
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
): Promise<Buffer> {
  try {
    let image: sharp.Sharp = sharp(img, { animated: true })
    image = sharp(
      await AddWatermark(
        img,
        options.watermarkType || 'text',
        defaultWatermarkFontPath,
        options.isFullScreenWatermark,
        forceNumber(options.watermarkDegree),
        options.watermarkText,
        options.watermarkFontPath,
        forceNumber(options.watermarkScaleRatio),
        options.watermarkColor,
        options.watermarkImagePath,
        options.watermarkPosition,
        forceNumber(options.watermarkImageOpacity),
      ),
      { animated: true },
    )
    return await image.toBuffer()
  } catch (error: any) {
    logger.error(`Image add watermark error: ${error}`)
    return img
  }
}
