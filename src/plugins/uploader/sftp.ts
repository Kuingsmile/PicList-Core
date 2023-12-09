import { type IPicGo, type IPluginConfig, type ISftpPlistConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { type ILocalesKey } from '../../i18n/zh-CN'
import path from 'path'
import SSHClient from '../../utils/sshClient'
import fs from 'fs-extra'

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const sftpplistConfig = ctx.getConfig<ISftpPlistConfig>('picBed.sftpplist')
  if (!sftpplistConfig) {
    throw new Error('Can not find sftpplist config!')
  }
  sftpplistConfig.port = Number(sftpplistConfig.port) || 22
  sftpplistConfig.uploadPath = (sftpplistConfig.uploadPath || '').replace(/^\/+|\/+$/g, '') + '/'
  const webPath = (sftpplistConfig.webPath || '').replace(/^\/+|\/+$/g, '') + '/'
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        let image = img.buffer
        if (!image && img.base64Image) {
          image = Buffer.from(img.base64Image, 'base64')
        }
        const uploadTempPath = path.join(ctx.baseDir, 'uploadTemp')
        const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'sftpplist')
        fs.ensureDirSync(imgTempPath)
        const tempFilePath = path.join(uploadTempPath, img.fileName)
        fs.ensureDirSync(path.dirname(tempFilePath))
        fs.writeFileSync(tempFilePath, image)
        const client = SSHClient.instance
        await client.connect(sftpplistConfig)
        const remotePath = path.join(`/${sftpplistConfig.uploadPath}`.replace(/\/\/+/g, '/'), img.fileName)
        await client.upload(tempFilePath, remotePath, sftpplistConfig)
        sftpplistConfig.fileUser && await client.chown(remotePath, sftpplistConfig.fileUser)
        delete img.base64Image
        delete img.buffer
        const baseUrl = sftpplistConfig.customUrl || sftpplistConfig.host
        if (sftpplistConfig.webPath) {
          img.imgUrl = `${baseUrl}/${webPath === '/' ? '' : encodeURIComponent(webPath)}${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/')
        } else {
          img.imgUrl = `${baseUrl}/${sftpplistConfig.uploadPath === '/' ? '' : encodeURIComponent(sftpplistConfig.uploadPath)}${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/')
        }
        fs.moveSync(tempFilePath, path.join(imgTempPath, img.fileName))
        img.galleryPath = `http://localhost:36699/sftpplist/${encodeURIComponent(img.fileName)}`
        client.close()
      }
    }
    return ctx
  } catch (err: any) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS')
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ISftpPlistConfig>('picBed.sftpplist') || {}
  const config: IPluginConfig[] = [
    {
      name: 'host',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_HOST') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_HOST') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_HOST')
      },
      default: userConfig.host || '',
      required: true
    },
    {
      name: 'port',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PORT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PORT') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_PORT')
      },
      default: userConfig.port || 22,
      required: false
    },
    {
      name: 'username',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_USERNAME') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_USERNAME') },
      default: userConfig.username || '',
      required: true
    },
    {
      name: 'password',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PASSWORD') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PASSWORD') },
      default: userConfig.password || '',
      required: false
    },
    {
      name: 'privateKey',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PRIVATEKEY') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PRIVATEKEY') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_PRIVATEKEY')
      },
      default: userConfig.privateKey || '',
      required: false
    },
    {
      name: 'passphrase',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PRIVATEKEY_PASSPHRASE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_PRIVATEKEY_PASSPHRASE') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_PRIVATEKEY_PASSPHRASE')
      },
      default: userConfig.passphrase || '',
      required: false
    },
    {
      name: 'uploadPath',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_UPLOADPATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_UPLOADPATH') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_UPLOADPATH')
      },
      default: userConfig.uploadPath || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_CUSTOMURL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_CUSTOMURL') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_CUSTOMURL')
      },
      default: userConfig.customUrl || '',
      required: false
    },
    {
      name: 'webPath',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_WEBSITE_PATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_WEBSITE_PATH') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_WEBSITE_PATH')
      },
      default: userConfig.webPath || '',
      required: false
    },
    {
      name: 'fileUser',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_FILE_USER') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_FILE_USER') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_FILE_USER')
      },
      default: userConfig.fileUser || '',
      required: false
    },
    {
      name: 'fileMode',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_FILE_MODE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_FILE_MODE') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_FILE_MODE')
      },
      default: userConfig.fileMode || '',
      required: false
    },
    {
      name: 'dirMode',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_DIR_MODE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_DIR_MODE') },
      get message () {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST_MESSAGE_DIR_MODE')
      },
      default: userConfig.dirMode || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('sftpplist', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST') },
    handle,
    config
  })
}
