import mime from 'mime'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IGithubConfig, IOldReqOptionsWithJSON, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig } from './helper'
import { buildInUploaderNames, encodePath, formatPathHelper } from './utils'

function buildGithubApiUrl(repo: string, path: string, fileName: string, extra: string = ''): string {
  return `https://api.github.com/repos/${repo}/contents/${encodePath(`${path}${fileName}`)}${extra}`
}

const postOptions = (fileName: string, options: IGithubConfig, data: any): IOldReqOptionsWithJSON => {
  const { token, repo } = options
  const contentType = mime.getType(fileName) || 'application/octet-stream'
  return {
    method: 'PUT',
    url: buildGithubApiUrl(repo, options.path, fileName),
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'PicList',
      'Content-Type': contentType,
    },
    body: data,
    json: true,
  } as const
}

const getOptions = (fileName: string, options: IGithubConfig): IOldReqOptionsWithJSON => {
  const { token, repo, branch } = options
  return {
    method: 'GET',
    url: buildGithubApiUrl(repo, options.path, fileName, `?ref=${branch}`),
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'PicList',
    },
    json: true,
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const githubOptions = getAndCheckConfig<IGithubConfig>(ctx, 'picBed.github', ['token'])

  const uploadPath = formatPathHelper({ path: githubOptions.path })
  const webPath = formatPathHelper({ path: githubOptions.webPath || '' })
  githubOptions.path = uploadPath
  githubOptions.customUrl = (githubOptions.customUrl || '').replace(/\/$/, '')
  try {
    for (const img of ctx.output) {
      if (!img.fileName) continue
      const base64Image = img.base64Image || (img.buffer ? Buffer.from(img.buffer).toString('base64') : null)
      if (!base64Image) continue
      const data = {
        message: 'Upload by PicList',
        branch: githubOptions.branch,
        content: base64Image,
        path: uploadPath + encodeURI(img.fileName),
      }
      const postConfig = postOptions(img.fileName, githubOptions, data)
      try {
        const body: {
          content: {
            download_url: string
            sha: string
          }
        } = await ctx.request(postConfig)
        if (!body) throw new Error('Server error, please try again')
        img.imgUrl = githubOptions.customUrl
          ? `${githubOptions.customUrl}/${encodePath(`${webPath || uploadPath}${img.fileName}`)}`
          : body.content.download_url
        img.hash = body.content.sha
        delete img.base64Image
        delete img.buffer
      } catch (err: any) {
        if (err.statusCode !== 422) throw err
        delete img.base64Image
        delete img.buffer
        const res = (await ctx.request(getOptions(img.fileName, githubOptions))) as any
        if (!Object.keys(res).length)
          throw new Error('Upload failed and the image does not exist in the repo', { cause: err })
        img.hash = res.sha
        img.imgUrl = githubOptions.customUrl
          ? `${githubOptions.customUrl}/${encodePath(`${webPath || uploadPath}${img.fileName}`)}`
          : res.download_url
      }
    }
    return ctx
  } catch (err: any) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK'),
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
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_REPO')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_REPO')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_REPO')
      },
      default: userConfig.repo || '',
      required: true,
    },
    {
      name: 'branch',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_BRANCH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_BRANCH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_BRANCH')
      },
      default: userConfig.branch || 'master',
      required: true,
    },
    {
      name: 'token',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_TOKEN')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_TOKEN')
      },
      default: userConfig.token || '',
      required: true,
    },
    {
      name: 'path',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_PATH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_PATH')
      },
      default: userConfig.path || '',
      required: false,
    },
    {
      name: 'webPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_WEBPATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_WEBPATH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_WEBPATH')
      },
      default: userConfig.webPath || '',
      required: false,
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_CUSTOMURL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_CUSTOMURL')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_CUSTOMURL')
      },
      default: userConfig.customUrl || '',
      required: false,
    },
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.github, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB')
    },
    handle,
    config,
  })
}
