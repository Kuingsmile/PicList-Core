import { mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ensureDir, move, remove } from 'fs-extra/esm'

import { IPicGo, IPluginConfig, ISftpPlistConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import SSHClient from '../../utils/sshClient'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, encodePath, formatPathHelper } from './utils'

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
  sftpplistConfig.uploadPath = formatPathHelper({
    path: sftpplistConfig.uploadPath,
    rootToEmpty: false,
  })
  const webPath = formatPathHelper({
    path: sftpplistConfig.webPath,
    rootToEmpty: false,
  })
  const baseUrl = sftpplistConfig.customUrl || sftpplistConfig.host
  const urlPath = sftpplistConfig.webPath ? webPath : sftpplistConfig.uploadPath
  const remoteDirectory = `/${sftpplistConfig.uploadPath}`.replace(/\\/g, '/')
  try {
    let client: SSHClient | undefined
    let uploadTempPath: string | undefined
    try {
      for (const img of ctx.output) {
        if (!img.fileName) continue
        const image = getImageBuffer(img)
        if (!image) continue
        if (!client) client = new SSHClient()
        if (!uploadTempPath) {
          const uploadTempRoot = path.join(ctx.baseDir, 'uploadTemp')
          await ensureDir(uploadTempRoot)
          uploadTempPath = await mkdtemp(path.join(uploadTempRoot, 'sftp-'))
        }
        const tempFilePath = path.join(uploadTempPath, path.basename(img.fileName))
        await writeFile(tempFilePath, image)
        if (!client.isConnected) await client.connect(sftpplistConfig)
        const remotePath = path.posix.join(remoteDirectory, img.fileName.replace(/\\/g, '/'))
        await client.upload(tempFilePath, remotePath, sftpplistConfig)
        sftpplistConfig.fileUser && (await client.chown(remotePath, sftpplistConfig.fileUser))
        delete img.base64Image
        delete img.buffer
        img.imgUrl = `${baseUrl}/${encodePath(`${urlPath === '/' ? '' : urlPath}${img.fileName}`)}`
        const imgTempFilePath = path.join(ctx.baseDir, 'imgTemp', 'sftpplist', img.fileName)
        await move(tempFilePath, imgTempFilePath, { overwrite: true })
        img.galleryPath = `http://localhost:36699/sftpplist/${encodeURIComponent(img.fileName)}`
      }
    } finally {
      try {
        client?.close()
      } finally {
        if (uploadTempPath) await remove(uploadTempPath)
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
