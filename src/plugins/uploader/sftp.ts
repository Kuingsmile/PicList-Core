import { mkdtemp, rename, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import path from 'node:path'

import { ensureDir, remove } from 'fs-extra/esm'

import { IPicGo, IPluginConfig, ISftpPlistConfig } from '../../types'
import { getSha256 } from '../../utils/common/hash'
import { IBuildInEvent } from '../../utils/enum'
import SSHClient from '../../utils/sshClient'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, encodePath } from './utils'

/** Requires a usable HTTP(S) base URL and supplies HTTPS for a bare SSH host. */
const getPublicBaseUrl = (config: ISftpPlistConfig): string => {
  const host = config.host.trim()
  const value = config.customUrl || `https://${isIP(host) === 6 ? `[${host}]` : host}`
  const invalidUrl = new Error(
    'SFTP public URL must be an absolute HTTP(S) URL without credentials, query, or fragment',
  )
  if (!URL.canParse(value)) throw invalidUrl
  const url = new URL(value)
  if (
    !/^https?:\/\//i.test(value) ||
    /[\\\s]/.test(value) ||
    !url.hostname ||
    url.username ||
    url.password ||
    value.includes('?') ||
    value.includes('#') ||
    (!config.customUrl && (url.pathname !== '/' || url.port))
  ) {
    throw invalidUrl
  }
  return url.href.replace(/\/+$/, '')
}

/** Resolves only relative filenames whose normalized destination stays inside its root. */
const getFilePathWithinRoot = (root: string, fileName: string, paths: typeof path): string => {
  const normalizedName = path.posix.normalize(fileName.replace(/\\/g, '/'))
  const filePath = paths.resolve(root, normalizedName)
  const relativePath = paths.relative(paths.resolve(root), filePath)
  if (
    fileName.includes('\0') ||
    path.win32.parse(fileName).root ||
    normalizedName === '..' ||
    normalizedName.startsWith('../') ||
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${paths.sep}`) ||
    paths.isAbsolute(relativePath)
  ) {
    throw new Error('Image filename must resolve to a file within the configured directory')
  }
  return filePath
}

/**
 * Stages images in an isolated batch directory, uploads over SSH, and retains gallery copies.
 *
 * @remarks
 * A connection and staging directory are reused within each batch and released even on failure.
 */
const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const sftpplistConfig = { ...getAndCheckConfig<ISftpPlistConfig>(ctx, 'picBed.sftpplist', []) }
  sftpplistConfig.port = Number(sftpplistConfig.port) || 22
  if (sftpplistConfig.port < 0 || sftpplistConfig.port > 65535) {
    sftpplistConfig.port = 22
  }
  const remoteDirectory = path.posix.resolve('/', sftpplistConfig.uploadPath?.replace(/\\/g, '/') || '/')
  const urlPath = sftpplistConfig.webPath
    ? path.posix.resolve('/', sftpplistConfig.webPath.replace(/\\/g, '/'))
    : remoteDirectory
  const destinationKey = getSha256(
    JSON.stringify([
      sftpplistConfig.host.toLowerCase(),
      sftpplistConfig.port,
      sftpplistConfig.username,
      path.posix.resolve(remoteDirectory),
    ]),
  )
  try {
    const baseUrl = getPublicBaseUrl(sftpplistConfig)
    let client: SSHClient | undefined
    let uploadTempPath: string | undefined
    try {
      for (const img of ctx.output) {
        if (!img.fileName) continue
        const image = getImageBuffer(img)
        if (!image) continue
        const remotePath = getFilePathWithinRoot(remoteDirectory, img.fileName, path.posix)
        const fileName = path.posix.relative(remoteDirectory, remotePath)
        const imgTempFilePath = getFilePathWithinRoot(
          path.join(ctx.baseDir, 'imgTemp', 'sftpplist', destinationKey),
          img.fileName,
          path,
        )
        const imgUrl = `${baseUrl}/${encodePath(path.posix.join(urlPath, fileName).slice(1))}`
        const galleryPath = `http://localhost:36699/sftpplist/${destinationKey}/${encodePath(fileName)}`
        if (!client) client = new SSHClient()
        if (!uploadTempPath) {
          const uploadTempRoot = path.join(ctx.baseDir, 'uploadTemp')
          await ensureDir(uploadTempRoot)
          uploadTempPath = await mkdtemp(path.join(uploadTempRoot, 'sftp-'))
        }
        const tempFilePath = path.join(uploadTempPath, path.posix.basename(fileName))
        await writeFile(tempFilePath, image)
        if (!client.isConnected) await client.connect(sftpplistConfig)
        await client.upload(tempFilePath, remotePath, sftpplistConfig)
        delete img.base64Image
        delete img.buffer
        img.imgUrl = imgUrl
        delete img.galleryPath
        try {
          await ensureDir(path.dirname(imgTempFilePath))
          await rename(tempFilePath, imgTempFilePath)
          img.galleryPath = galleryPath
        } catch (_error) {
          ctx.log.warn('SFTP upload succeeded, but the gallery cache could not be updated.')
        }
      }
    } finally {
      try {
        client?.close()
      } catch (_error) {
        ctx.log.warn('Failed to close the SFTP connection.')
      }
      if (uploadTempPath) {
        await remove(uploadTempPath).catch(() => ctx.log.warn('Failed to clean up SFTP staging files.'))
      }
    }
    return ctx
  } catch (err: any) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.t('UPLOAD_FAILED'),
      body: ctx.i18n.t('CHECK_SETTINGS'),
    })
    throw err
  }
}

/** Builds the SFTP configuration form using saved values and localized field labels. */
const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ISftpPlistConfig>('picBed.sftpplist') || {}
  const config: IPluginConfig[] = [
    {
      name: 'host',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_HOST')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_HOST')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_HOST')
      },
      default: userConfig.host || '',
      required: true,
    },
    {
      name: 'port',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PORT')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PORT')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_PORT')
      },
      default: userConfig.port || 22,
      required: false,
    },
    {
      name: 'username',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_USERNAME')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_USERNAME')
      },
      default: userConfig.username || '',
      required: true,
    },
    {
      name: 'password',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PASSWORD')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PASSWORD')
      },
      default: userConfig.password || '',
      required: false,
    },
    {
      name: 'privateKey',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PRIVATEKEY')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PRIVATEKEY')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_PRIVATEKEY')
      },
      default: userConfig.privateKey || '',
      required: false,
    },
    {
      name: 'passphrase',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PRIVATEKEY_PASSPHRASE')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_PRIVATEKEY_PASSPHRASE')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_PRIVATEKEY_PASSPHRASE')
      },
      default: userConfig.passphrase || '',
      required: false,
    },
    {
      name: 'uploadPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_UPLOADPATH')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_UPLOADPATH')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_UPLOADPATH')
      },
      default: userConfig.uploadPath || '',
      required: false,
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_CUSTOMURL')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_CUSTOMURL')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_CUSTOMURL')
      },
      default: userConfig.customUrl || '',
      required: false,
    },
    {
      name: 'webPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_WEBSITE_PATH')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_WEBSITE_PATH')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_WEBSITE_PATH')
      },
      default: userConfig.webPath || '',
      required: false,
    },
    {
      name: 'fileUser',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_FILE_USER')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_FILE_USER')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_FILE_USER')
      },
      default: userConfig.fileUser || '',
      required: false,
    },
    {
      name: 'fileMode',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_FILE_MODE')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_FILE_MODE')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_FILE_MODE')
      },
      default: userConfig.fileMode || '',
      required: false,
    },
    {
      name: 'dirMode',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_SFTPPLIST_DIR_MODE')
      },
      get alias() {
        return ctx.i18n.t('PICBED_SFTPPLIST_DIR_MODE')
      },
      get message() {
        return ctx.i18n.t('PICBED_SFTPPLIST_MESSAGE_DIR_MODE')
      },
      default: userConfig.dirMode || '',
      required: false,
    },
  ]
  return config
}

/** Registers the built-in SFTP uploader and its configuration form on the client. */
export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.sftpplist, {
    get name() {
      return ctx.i18n.t('PICBED_SFTPPLIST')
    },
    handle,
    config,
  })
}
