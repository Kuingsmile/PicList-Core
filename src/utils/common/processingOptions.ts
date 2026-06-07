import type {
  IBuildInCompressOptions,
  IBuildInCompressOptionsTreated,
  IBuildInWaterMarkOptions,
  IBuildInWaterMarkOptionsTreated,
} from '../../types'
import { forceNumber } from './config'

const resolveOption = <T>(
  idSpecificValue: T | undefined,
  globalMap: Record<string, T> | undefined,
  picBed: string,
  globalValue: T | undefined,
): T | undefined => idSpecificValue ?? globalMap?.[picBed] ?? globalValue

const resolveBooleanOption = <T>(
  idSpecificValue: T | undefined,
  globalMap: Record<string, T> | undefined,
  picBed: string,
  globalValue: T | undefined,
): boolean => !!resolveOption(idSpecificValue, globalMap, picBed, globalValue)

const resolveNumberOption = (
  idSpecificValue: number | undefined,
  globalMap: Record<string, number> | undefined,
  picBed: string,
  globalValue: number | undefined,
): number => forceNumber(resolveOption(idSpecificValue, globalMap, picBed, globalValue))

export function getTreatedWaterMarkOptions(
  global: IBuildInWaterMarkOptions | undefined,
  idSpecificConfig: Partial<IBuildInWaterMarkOptions>,
  picBed: string,
  id: string,
): IBuildInWaterMarkOptionsTreated {
  global = global || {}
  const options: IBuildInWaterMarkOptionsTreated = {
    isAddWatermark: resolveBooleanOption(
      idSpecificConfig.isAddWatermark,
      global.isAddWatermarkMap,
      picBed,
      global.isAddWatermark,
    ),
    watermarkType:
      resolveOption(idSpecificConfig.watermarkType, global.watermarkTypeMap, picBed, global.watermarkType) || 'text',
    isFullScreenWatermark: resolveBooleanOption(
      idSpecificConfig.isFullScreenWatermark,
      global.isFullScreenWatermarkMap,
      picBed,
      global.isFullScreenWatermark,
    ),
    watermarkDegree: resolveNumberOption(
      idSpecificConfig.watermarkDegree,
      global.watermarkDegreeMap,
      picBed,
      global.watermarkDegree,
    ),
    watermarkText:
      resolveOption(idSpecificConfig.watermarkText, global.watermarkTextMap, picBed, global.watermarkText) || '',
    watermarkFontPath: (idSpecificConfig.watermarkFontPath ?? global.watermarkFontPath) || '',
    watermarkScaleRatio: resolveNumberOption(
      idSpecificConfig.watermarkScaleRatio,
      global.watermarkScaleRatioMap,
      picBed,
      global.watermarkScaleRatio,
    ),
    watermarkColor:
      resolveOption(idSpecificConfig.watermarkColor, global.watermarkColorMap, picBed, global.watermarkColor) ||
      'rgba(204, 204, 204, 0.45)',
    watermarkImagePath:
      resolveOption(
        idSpecificConfig.watermarkImagePath,
        global.watermarkImagePathMap,
        picBed,
        global.watermarkImagePath,
      ) || '',
    watermarkPosition:
      resolveOption(
        idSpecificConfig.watermarkPosition,
        global.watermarkPositionMap,
        picBed,
        global.watermarkPosition,
      ) || 'southeast',
    watermarkImageOpacity: resolveNumberOption(
      idSpecificConfig.watermarkImageOpacity,
      global.watermarkImageOpacityMap,
      picBed,
      global.watermarkImageOpacity,
    ),
    picBed,
    id,
  }
  return options
}

export function getTreatedCompressOptions(
  global: IBuildInCompressOptions | undefined,
  idSpecificConfig: Partial<IBuildInCompressOptions>,
  picBed: string,
  id: string,
): IBuildInCompressOptionsTreated {
  global = global || {}
  const options: IBuildInCompressOptionsTreated = {
    quality: resolveNumberOption(idSpecificConfig.quality, global.qualityMap, picBed, global.quality),
    isConvert: resolveBooleanOption(idSpecificConfig.isConvert, global.isConvertMap, picBed, global.isConvert),
    convertFormat:
      resolveOption(idSpecificConfig.convertFormat, global.convertFormatMap, picBed, global.convertFormat) || 'jpg',
    isReSize: resolveBooleanOption(idSpecificConfig.isReSize, global.isReSizeMap, picBed, global.isReSize),
    reSizeHeight: resolveNumberOption(
      idSpecificConfig.reSizeHeight,
      global.reSizeHeightMap,
      picBed,
      global.reSizeHeight,
    ),
    reSizeWidth: resolveNumberOption(idSpecificConfig.reSizeWidth, global.reSizeWidthMap, picBed, global.reSizeWidth),
    skipReSizeOfSmallImg: resolveBooleanOption(
      idSpecificConfig.skipReSizeOfSmallImg,
      global.skipReSizeOfSmallImgMap,
      picBed,
      global.skipReSizeOfSmallImg,
    ),
    isReSizeByPercent: resolveBooleanOption(
      idSpecificConfig.isReSizeByPercent,
      global.isReSizeByPercentMap,
      picBed,
      global.isReSizeByPercent,
    ),
    reSizePercent: resolveNumberOption(
      idSpecificConfig.reSizePercent,
      global.reSizePercentMap,
      picBed,
      global.reSizePercent,
    ),
    longEdgeAsHeight: resolveBooleanOption(
      idSpecificConfig.longEdgeAsHeight,
      global.longEdgeAsHeightMap,
      picBed,
      global.longEdgeAsHeight,
    ),
    isRotate: resolveBooleanOption(idSpecificConfig.isRotate, global.isRotateMap, picBed, global.isRotate),
    rotateDegree: resolveNumberOption(
      idSpecificConfig.rotateDegree,
      global.rotateDegreeMap,
      picBed,
      global.rotateDegree,
    ),
    isRemoveExif: resolveBooleanOption(
      idSpecificConfig.isRemoveExif,
      global.isRemoveExifMap,
      picBed,
      global.isRemoveExif,
    ),
    isFlip: resolveBooleanOption(idSpecificConfig.isFlip, global.isFlipMap, picBed, global.isFlip),
    isFlop: resolveBooleanOption(idSpecificConfig.isFlop, global.isFlopMap, picBed, global.isFlop),
    formatConvertObj:
      resolveOption(idSpecificConfig.formatConvertObj, global.formatConvertObjMap, picBed, global.formatConvertObj) ||
      {},
    picBed,
    id,
  }
  return options
}
