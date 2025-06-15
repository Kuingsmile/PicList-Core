import { IPicGo } from '../../types'
import ImgFromBase64 from './base64'
import ImgFromPath from './path'

const buildInTransformers = () => {
  return {
    register(ctx: IPicGo) {
      ctx.helper.transformer.register('path', ImgFromPath)
      ctx.helper.transformer.register('base64', ImgFromBase64)
    }
  }
}

export default buildInTransformers
