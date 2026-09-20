import { IPicGo } from '../../types'
import ImgFromBase64 from './base64'
import ImgFromPath from './path'

/** Creates the plugin interface that installs built-in path and base64 transformers. */
const buildInTransformers = () => {
  return {
    /** Registers the built-in input transformers on the supplied client. */
    register(ctx: IPicGo) {
      ctx.helper.transformer.register('path', ImgFromPath)
      ctx.helper.transformer.register('base64', ImgFromBase64)
    },
  }
}

export default buildInTransformers
