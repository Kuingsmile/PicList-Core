import { IPicGo } from '../../types'

/** Appends already prepared image records from input to output without decoding or loading files. */
const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  ctx.output.push(...ctx.input)
  return ctx
}

export default {
  handle,
}
