import { type IPicGo, type IPluginConfig, type IGithubConfig, type IOldReqOptionsWithJSON } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { type ILocalesKey } from '../../i18n/zh-CN'
import mime from 'mime-types'

function buildGithubApiUrl (repo: string, path: string, fileName: string, extra: string = ''): string {
  const encodedPath = encodeURIComponent(path)
  const encodedFileName = encodeURIComponent(fileName)
  return `https://api.github.com/repos/${repo}/contents/${encodedPath}${encodedFileName}${extra}`.replace(/%2F/g, '/')
}

const postOptions = (fileName: string, options: IGithubConfig, data: any): IOldReqOptionsWithJSON => {
  const { token, repo } = options
  const contentType = mime.lookup(fileName) || 'application/octet-stream'
  return {
    method: 'PUT',
    url: buildGithubApiUrl(repo, options.path || '', fileName),
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'PicList',
      'Content-Type': contentType
    },
    body: data,
    json: true
  } as const
}

const getOptions = (fileName: string, options: IGithubConfig): IOldReqOptionsWithJSON => {
  const { token, repo, branch } = options
  return {
    method: 'GET',
    url: buildGithubApiUrl(repo, options.path || '', fileName, `?ref=${branch}`),
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'PicGo'
    },
    json: true
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const githubOptions = ctx.getConfig<IGithubConfig>('picBed.github')
  if (!githubOptions) {
    throw new Error('Can\'t find github config')
  }
  try {
    const imgList = ctx.output
    const uploadPath = githubOptions.path || ''
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const base64Image = img.base64Image || Buffer.from(img.buffer).toString('base64')
        const data = {
          message: 'Upload by PicList',
          branch: githubOptions.branch,
          content: base64Image,
          path: uploadPath + encodeURI(img.fileName)
        }
        const postConfig = postOptions(img.fileName, githubOptions, data)
        try {
          const body: {
            content: {
              download_url: string
              sha: string
            }
          } = await ctx.request(postConfig)
          if (body) {
            delete img.base64Image
            delete img.buffer
            img.imgUrl = githubOptions.customUrl ? `${githubOptions.customUrl}/${encodeURIComponent(uploadPath)}${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/') : body.content.download_url
            img.hash = body.content.sha
          } else {
            throw new Error('Server error, please try again')
          }
        } catch (err: any) {
          if (err.statusCode === 422) {
            delete img.base64Image
            delete img.buffer
            const res = await ctx.request(getOptions(img.fileName, githubOptions)) as any
            if (Object.keys(res).length) {
              img.hash = res.sha
              img.imgUrl = githubOptions.customUrl ? `${githubOptions.customUrl}/${encodeURIComponent(uploadPath)}${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/') : res.download_url
            } else {
              throw new Error('Get Contents error, please try again')
            }
          } else {
            throw err
          }
        }
      }
    }
    return ctx
  } catch (err) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK')
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IGithubConfig>('picBed.github') || {}
  const config: IPluginConfig[] = [
    {
      name: 'repo',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_REPO') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_REPO') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_REPO') },
      default: userConfig.repo || '',
      required: true
    },
    {
      name: 'branch',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_BRANCH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_BRANCH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_BRANCH') },
      default: userConfig.branch || 'master',
      required: true
    },
    {
      name: 'token',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_TOKEN') },
      default: userConfig.token || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_PATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_PATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_PATH') },
      default: userConfig.path || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_CUSTOMURL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_CUSTOMURL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_CUSTOMURL') },
      default: userConfig.customUrl || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('github', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB') },
    handle,
    config
  })
}
