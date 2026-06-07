import mime from 'mime'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IGithubConfig, IOldReqOptionsWithJSON, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig } from './helper'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

const messageGetter = (ctx: IPicGo, key: ILocalesKey) => ({
  get message() {
    return ctx.i18n.translate<ILocalesKey>(key)
  },
})

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
    createField(
      ctx,
      'github',
      'repo',
      'input',
      userConfig.repo || '',
      true,
      undefined,
      messageGetter(ctx, 'PICBED_GITHUB_MESSAGE_REPO'),
    ),
    createField(
      ctx,
      'github',
      'branch',
      'input',
      userConfig.branch || 'master',
      true,
      undefined,
      messageGetter(ctx, 'PICBED_GITHUB_MESSAGE_BRANCH'),
    ),
    createField(ctx, 'github', 'token', 'input', userConfig.token || '', true),
    createField(
      ctx,
      'github',
      'path',
      'input',
      userConfig.path || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_GITHUB_MESSAGE_PATH'),
    ),
    createField(
      ctx,
      'github',
      'webPath',
      'input',
      userConfig.webPath || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_GITHUB_MESSAGE_WEBPATH'),
    ),
    createField(
      ctx,
      'github',
      'customUrl',
      'input',
      userConfig.customUrl || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_GITHUB_MESSAGE_CUSTOMURL'),
    ),
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
