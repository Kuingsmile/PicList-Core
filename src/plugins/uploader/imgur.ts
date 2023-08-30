import { type IPicGo, type IPluginConfig, type IImgurConfig, type IOldReqOptions, type IFullResponse } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { type ILocalesKey } from '../../i18n/zh-CN'

const formatAccessToken = (accessToken: string): string => accessToken ? accessToken.startsWith('Bearer') ? accessToken : `Bearer ${accessToken}` : ''

const postOptions = async (ctx: IPicGo, options: IImgurConfig, fileName: string, imgBase64: string): Promise<IOldReqOptions> => {
  const clientId = options.clientId || ''
  const username = options.username || ''
  const accessToken = formatAccessToken(options.accessToken || '')
  const album = options.album || ''
  let authorization
  if (username && accessToken) {
    authorization = accessToken
  } else if (clientId) {
    authorization = `Client-ID ${clientId}`
  } else {
    throw new Error('clientId or accessToken is required')
  }
  const requestOptions: IOldReqOptions = {
    method: 'POST',
    url: 'https://api.imgur.com/3/image',
    headers: {
      Authorization: authorization,
      'content-type': 'multipart/form-data',
      Host: 'api.imgur.com',
      'User-Agent': 'PicList'
    },
    formData: {
      image: imgBase64,
      type: 'base64',
      name: fileName,
      description: 'Uploaded with PicList'
    }
  }
  if (username && accessToken && album) {
    let initPages = 0
    let res
    let albumHash = ''
    do {
      const getAlbumHashOptions: IOldReqOptions = {
        method: 'GET',
        url: `https://api.imgur.com/3/account/${username}/albums/${initPages}`,
        headers: {
          Authorization: authorization
        },
        json: true,
        resolveWithFullResponse: true,
        timeout: 10000
      }
      if (options.proxy) {
        getAlbumHashOptions.proxy = options.proxy
      }
      res = await ctx.request(getAlbumHashOptions) as unknown as IFullResponse
      if (!(res.statusCode === 200 && res.body.success)) {
        throw new Error('Server error, please try again')
      }
      const albumList = res.body.data
      for (const item of albumList) {
        if (item.title === album) {
          albumHash = item.id
          break
        }
      }
      initPages++
    } while (res.body.data.length > 0)
    if (albumHash && requestOptions.formData) {
      requestOptions.formData.album = albumHash
    }
  }
  if (options.proxy) {
    requestOptions.proxy = options.proxy
  }
  return requestOptions
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const imgurOptions = ctx.getConfig<IImgurConfig>('picBed.imgur')
  if (!imgurOptions) {
    throw new Error('Can\'t find imgur config')
  }
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const base64Image = img.base64Image || Buffer.from(img.buffer).toString('base64')
        const options = await postOptions(ctx, imgurOptions, img.fileName, base64Image)
        const res: string = await ctx.request(options)
        const body = typeof res === 'string' ? JSON.parse(res) : res
        if (body.success) {
          delete img.base64Image
          delete img.buffer
          img.imgUrl = body.data.link
          img.hash = body.data.deletehash
        } else {
          throw new Error('Server error, please try again')
        }
      }
    }
    return ctx
  } catch (err) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK'),
      text: 'http://docs.imgur.com/api/errno/'
    })
    // @ts-expect-error string | IError
    throw err?.response?.data || err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IImgurConfig>('picBed.imgur') || {}
  const config: IPluginConfig[] = [
    {
      name: 'clientId',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_CLIENTID') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_CLIENTID') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_MESSAGE_CLIENTID') },
      default: userConfig.clientId || '',
      required: false
    },
    {
      name: 'username',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_USERNAME') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_USERNAME') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_MESSAGE_USERNAME') },
      default: userConfig.username || '',
      required: false
    },
    {
      name: 'accessToken',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_ACCESS_TOKEN') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_ACCESS_TOKEN') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_MESSAGE_ACCESS_TOKEN') },
      default: userConfig.accessToken || '',
      required: false
    },
    {
      name: 'album',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_ALBUM') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_ALBUM') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_MESSAGE_ALBUM') },
      default: userConfig.album || '',
      required: false
    },
    {
      name: 'proxy',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_PROXY') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_PROXY') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_MESSAGE_PROXY') },
      default: userConfig.proxy || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('imgur', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR') },
    handle,
    config
  })
}
