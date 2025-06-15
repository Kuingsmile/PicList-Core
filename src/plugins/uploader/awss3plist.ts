import uploader from './s3/uploader'

import { formatPath } from './s3/utils'
import { IAwsS3PListUserConfig, IPicGo, IPluginConfig } from '../../types'
import { ILocalesKey } from '../../i18n/zh-CN'
import { IBuildInEvent } from '../../utils/enum'
import { buildInUploaderNames } from './utils'

function formatDisableBucketPrefixToURL(disableBucketPrefixToURL: string | boolean | undefined): boolean {
  if (typeof disableBucketPrefixToURL === 'string') {
    return disableBucketPrefixToURL.toLowerCase() === 'true'
  }
  return Boolean(disableBucketPrefixToURL)
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const userConfig: IAwsS3PListUserConfig = ctx.getConfig('picBed.aws-s3-plist')
  if (!userConfig) throw new Error("Can't find aws s3 uploader config")
  try {
    const disableBucketPrefixToURL = formatDisableBucketPrefixToURL(userConfig.disableBucketPrefixToURL)
    let urlPrefix = userConfig.urlPrefix
    if (urlPrefix) {
      urlPrefix = urlPrefix.replace(/\/?$/, '')
      if (userConfig.pathStyleAccess && !disableBucketPrefixToURL) {
        urlPrefix += '/' + userConfig.bucketName
      }
    }
    const client = uploader.createS3Client(userConfig)
    const imgList = ctx.output
    for (const img of imgList) {
      const task = await uploader.createUploadTask({
        client,
        bucketName: userConfig.bucketName,
        path: formatPath(img, userConfig.uploadPath),
        item: img,
        acl: userConfig.acl || 'public-read',
        urlPrefix
      })
      delete img.buffer
      delete img.base64Image
      img.imgUrl = task.imgURL
      img.url = task.url
    }

    return ctx
  } catch (err: any) {
    ctx.log.error(err)
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK'),
      text: ''
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const defaultConfig: IAwsS3PListUserConfig = {
    accessKeyID: '',
    secretAccessKey: '',
    bucketName: '',
    uploadPath: '{year}/{month}/{md5}.{extName}',
    pathStyleAccess: false,
    rejectUnauthorized: false,
    acl: 'public-read'
  }
  let userConfig = ctx.getConfig<IAwsS3PListUserConfig>('picBed.aws-s3-plist') || {}
  userConfig = { ...defaultConfig, ...userConfig }
  const config: IPluginConfig[] = [
    {
      name: 'accessKeyID',
      type: 'input',
      default: userConfig.accessKeyID,
      required: true,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACCESSKEYID')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACCESSKEYID')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_ACCESSKEYID')
      }
    },
    {
      name: 'secretAccessKey',
      type: 'input',
      default: userConfig.secretAccessKey,
      required: true,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_SECRET_ACCESSKEY')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_SECRET_ACCESSKEY')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_SECRET_ACCESSKEY')
      }
    },
    {
      name: 'bucketName',
      type: 'input',
      default: userConfig.bucketName,
      required: true,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_BUCKET')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_BUCKET')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_BUCKET')
      }
    },
    {
      name: 'uploadPath',
      type: 'input',
      default: userConfig.uploadPath,
      required: true,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_UPLOADPATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_UPLOADPATH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_UPLOADPATH')
      }
    },
    {
      name: 'region',
      type: 'input',
      default: userConfig.region,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REGION')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REGION')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_REGION')
      }
    },
    {
      name: 'endpoint',
      type: 'input',
      default: userConfig.endpoint,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ENDPOINT')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ENDPOINT')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_ENDPOINT')
      }
    },
    {
      name: 'proxy',
      type: 'input',
      default: userConfig.proxy,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PROXY')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PROXY')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_PROXY')
      }
    },
    {
      name: 'urlPrefix',
      type: 'input',
      default: userConfig.urlPrefix,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_URLPREFIX')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_URLPREFIX')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_URLPREFIX')
      }
    },
    {
      name: 'pathStyleAccess',
      type: 'confirm',
      default: userConfig.pathStyleAccess || false,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PATHSTYLEACCESS')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PATHSTYLEACCESS')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_PATHSTYLEACCESS')
      }
    },
    {
      name: 'rejectUnauthorized',
      type: 'confirm',
      default: userConfig.rejectUnauthorized || false,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REJECTUNAUTHORIZED')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REJECTUNAUTHORIZED')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_REJECTUNAUTHORIZED')
      }
    },
    {
      name: 'acl',
      type: 'list',
      default: userConfig.acl || 'public-read',
      choices: [
        'private',
        'public-read',
        'public-read-write',
        'authenticated-read',
        'aws-exec-read',
        'bucket-owner-read',
        'bucket-owner-full-control'
      ],
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACL')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_ACL')
      }
    },
    {
      name: 'disableBucketPrefixToURL',
      type: 'confirm',
      default: formatDisableBucketPrefixToURL(userConfig.disableBucketPrefixToURL) || false,
      required: false,
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_DISABLEBUCKETPREFIXTOURL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_DISABLEBUCKETPREFIXTOURL')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_DISABLEBUCKETPREFIXTOURL')
      }
    }
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames['aws-s3-plist'], {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST')
    },
    handle,
    config
  })
}
