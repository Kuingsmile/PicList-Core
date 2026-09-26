import type { AxiosRequestConfig } from 'axios'

import type {
  IBuildInCompressOptions,
  IBuildInCompressOptionsTreated,
  IBuildInWaterMarkOptions,
  IBuildInWaterMarkOptionsTreated,
  IFullResponse,
  IOldReqOptions,
  IOldReqOptionsWithFullResponse,
  IOldReqOptionsWithJSON,
  IReqOptions,
  IReqOptionsWithArrayBufferRes,
  IReqOptionsWithBodyResOnly,
  IRequest,
  IResponse,
  IStringKeyMap,
} from '../../src/types'

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Assert<T extends true> = T
interface Data {
  url: string
}
interface FullBinaryOptions {
  resolveWithFullResponse: true
  json: true
  responseType: 'arraybuffer'
}

// The pre-refactor generic response contract. Concrete flag tests alone cannot detect changes
// to assignability while the caller's option type is still an unresolved type parameter.
type LegacyResponse<T, U> = U extends { resolveWithFullResponse: true }
  ? IFullResponse<T, U>
  : U extends { json: true }
    ? T
    : U extends { responseType: 'arraybuffer' }
      ? Buffer
      : U extends IOldReqOptionsWithFullResponse
        ? IFullResponse<T, U>
        : U extends IOldReqOptionsWithJSON
          ? T
          : U extends IOldReqOptions
            ? string
            : U extends IReqOptionsWithBodyResOnly
              ? T
              : string

/** Preserves assignments made by plugins that wrap generic requests using the original contract. */
export function checkGenericResponseCompatibility<T, U>(current: IResponse<T, U>, legacy: LegacyResponse<T, U>) {
  const toLegacy: LegacyResponse<T, U> = current
  const toCurrent: IResponse<T, U> = legacy
  return { toLegacy, toCurrent }
}

// Compiled by yarn typecheck. Flag precedence and legacy fallbacks are part of the public API.
export type ResponseCompatibility = [
  Assert<Equal<IResponse<Data, FullBinaryOptions>, IFullResponse<Data, FullBinaryOptions>>>,
  Assert<Equal<IResponse<Data, { json: true; responseType: 'arraybuffer' }>, Data>>,
  Assert<Equal<IResponse<Data, { responseType: 'arraybuffer' }>, Buffer>>,
  Assert<Equal<IResponse<Data, IOldReqOptionsWithFullResponse>, IFullResponse<Data, IOldReqOptionsWithFullResponse>>>,
  Assert<Equal<IResponse<Data, IOldReqOptionsWithJSON>, Data>>,
  Assert<Equal<IResponse<Data, IOldReqOptions>, string>>,
  Assert<Equal<IResponse<Data, IReqOptions>, IFullResponse<Data, IReqOptions>>>,
  Assert<Equal<IResponse<Data, IReqOptionsWithArrayBufferRes>, IFullResponse<Data, IReqOptionsWithArrayBufferRes>>>,
  Assert<Equal<IResponse<Data, IReqOptionsWithBodyResOnly>, Data>>,
  Assert<Equal<IResponse<Data, { url: string }>, string>>,
  Assert<Equal<IResponse<Data, { url: string; json?: boolean }>, string>>,
  Assert<Equal<IResponse<Data, { json: true } | { responseType: 'arraybuffer' }>, Data | Buffer>>,
  Assert<Equal<IResponse<Data, unknown>, string>>,
  Assert<Equal<IResponse<Data, never>, never>>,
  Assert<Equal<IResponse<Data, any>, IFullResponse<Data, any> | Data | Buffer | string>>,
]

export type DictionaryCompatibility = [
  Assert<Equal<IStringKeyMap<string | number>, Record<string, string | number>>>,
  Assert<Equal<IStringKeyMap<any>, Record<string, any>>>,
  Assert<Equal<IStringKeyMap<unknown>, Record<string, unknown>>>,
  Assert<Equal<IStringKeyMap<never>, Record<string, never>>>,
  Assert<Equal<IStringKeyMap<null | undefined>, Record<string, null | undefined>>>,
]

type LegacyDictionary<T> = Record<string, T extends T ? T : any>

/** Keeps generic plugin dictionaries compatible, including before their value type is resolved. */
export function checkGenericDictionaryCompatibility<T>(current: IStringKeyMap<T>, legacy: LegacyDictionary<T>) {
  const toLegacy: LegacyDictionary<T> = current
  const toCurrent: IStringKeyMap<T> = legacy
  return { toLegacy, toCurrent }
}

/** Compile-only checks for inferred and explicit generic request calls. */
export function checkRequestCompatibility(request: IRequest) {
  const legacy: Promise<string> = request.request({ url: 'https://example.com', body: 'payload' })
  const binary: Promise<Buffer> = request.request({ url: 'https://example.com', responseType: 'arraybuffer' as const })
  const json: Promise<Data> = request.request<Data, IOldReqOptionsWithJSON>({
    url: 'https://example.com',
    json: true,
  })
  const full: Promise<IFullResponse<Data, IReqOptions<Data>>> = request.request<Data, IReqOptions<Data>>({
    url: 'https://example.com',
    resolveWithFullResponse: true,
    data: { url: 'image.png' },
  })
  const axios: Promise<Data> = request.request<Data, AxiosRequestConfig>({ baseURL: 'https://example.com' })

  // @ts-expect-error Legacy proxy options still require a URL.
  request.request({ proxy: 'http://localhost:8080' })
  // @ts-expect-error Request validation must not become any.
  request.request({ url: 'https://example.com', timeout: 'slow' })

  return { legacy, binary, json, full, axios }
}

/** Compile-only checks for optional settings, uploader maps, and plugin-defined fields. */
export function checkProcessingCompatibility() {
  const watermark: IBuildInWaterMarkOptions = {
    watermarkType: 'text',
    watermarkTypeMap: { local: 'image' },
    watermarkDegreeMap: { local: 45 },
    watermarkPositionMap: { local: 'southeast' },
    pluginSettings: { custom: true },
  }
  const compress: IBuildInCompressOptions = {
    quality: 80,
    qualityMap: { local: 90 },
    convertFormatMap: { local: 'webp' },
    longEdgeAsHeightMap: { local: true },
    formatConvertObj: '{"png":"webp"}',
    formatConvertObjMap: { local: { png: 'webp' }, github: '{"png":"jpeg"}' },
    pluginSettings: { custom: true },
  }
  const treatedWatermark: IBuildInWaterMarkOptionsTreated = { watermarkType: 'image', custom: true }
  const treatedCompress: IBuildInCompressOptionsTreated = { quality: 80, custom: true }

  // @ts-expect-error Known scalar fields remain checked despite the plugin index signature.
  watermark.watermarkDegree = '45'
  // @ts-expect-error Map values retain the watermark union.
  watermark.watermarkTypeMap = { local: 'video' }
  // @ts-expect-error Map entries cannot be undefined just because the setting is optional.
  watermark.watermarkDegreeMap = { local: undefined }
  // @ts-expect-error Map values retain numeric quality checking.
  compress.qualityMap = { local: '90' }
  // @ts-expect-error Map entries remain defined numbers.
  compress.qualityMap = { local: undefined }
  // @ts-expect-error Maps retain Sharp's supported format keys.
  compress.convertFormatMap = { local: 'unsupported' }
  // @ts-expect-error Treated settings keep their scalar types.
  treatedCompress.quality = '80'
  // @ts-expect-error Treated watermark settings keep their union types.
  treatedWatermark.watermarkType = 'video'

  return { watermark, compress, treatedWatermark, treatedCompress }
}

// Public interfaces remain independently augmentable by plugins.
declare module '../../src/types' {
  interface IBuildInWaterMarkOptionsTreated {
    pluginWatermark?: 'treated-only'
  }
  interface IBuildInCompressOptionsTreated {
    pluginCompression?: 'treated-only'
  }
}

export type ExtensionCompatibility = [
  Assert<Equal<keyof IBuildInWaterMarkOptions, string | number>>,
  Assert<Equal<keyof IBuildInWaterMarkOptionsTreated, string | number>>,
  Assert<Equal<keyof IBuildInCompressOptions, string | number>>,
  Assert<Equal<keyof IBuildInCompressOptionsTreated, string | number>>,
  Assert<Equal<IBuildInWaterMarkOptionsTreated['pluginWatermark'], 'treated-only' | undefined>>,
  Assert<Equal<IBuildInCompressOptionsTreated['pluginCompression'], 'treated-only' | undefined>>,
  Assert<Equal<IBuildInWaterMarkOptions['pluginWatermark'], any>>,
  Assert<Equal<IBuildInCompressOptions['pluginCompression'], any>>,
]
