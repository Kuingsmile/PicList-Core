import type { IPathTransformedImgInfo, IPicGo } from '../types'

interface PreprocessedInput {
  input: string
  info: IPathTransformedImgInfo
}

const preprocessedInputs = new WeakMap<IPicGo, Map<number, PreprocessedInput>>()

/** Retains an unchanged input's load result for this upload's path transformer, including failures. */
export const cachePreprocessedInput = (
  ctx: IPicGo,
  index: number,
  input: string,
  info: IPathTransformedImgInfo,
): void => {
  let inputs = preprocessedInputs.get(ctx)
  if (!inputs) {
    inputs = new Map()
    preprocessedInputs.set(ctx, inputs)
  }
  inputs.set(index, { input, info })
}

/** Consumes cached bytes only if a hook has not replaced the corresponding input. */
export const takePreprocessedInput = (
  ctx: IPicGo,
  index: number,
  input: string | Buffer,
): IPathTransformedImgInfo | undefined => {
  const inputs = preprocessedInputs.get(ctx)
  const cached = inputs?.get(index)
  inputs?.delete(index)
  return cached?.input === input ? cached.info : undefined
}

/** Releases unused bytes after an upload, including failed hooks and custom transformers. */
export const clearPreprocessedInputs = (ctx: IPicGo): void => {
  preprocessedInputs.delete(ctx)
}
