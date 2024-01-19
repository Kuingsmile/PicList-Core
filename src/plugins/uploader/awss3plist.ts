
import uploader, { IUploadResult } from "./s3/uploader"
import { formatPath } from "./s3/utils"
import { IAwsS3PListUserConfig, IPicGo, IPluginConfig } from "../../types"
import { ILocalesKey } from "../../i18n/zh-CN"

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const userConfig: IAwsS3PListUserConfig = ctx.getConfig("picBed.aws-s3-plist")
    if (!userConfig) {
      throw new Error("Can't find amazon s3 uploader config")
    }
    if (userConfig.urlPrefix) {
      userConfig.urlPrefix = userConfig.urlPrefix.replace(/\/?$/, "")
      if (userConfig.pathStyleAccess && !userConfig.disableBucketPrefixToURL) {
        userConfig.urlPrefix += "/" + userConfig.bucketName
      }
    }

    const client = uploader.createS3Client(userConfig)
    const output = ctx.output

    const tasks = output.map((item, idx) =>
      uploader.createUploadTask({
        client,
        index: idx,
        bucketName: userConfig.bucketName,
        path: formatPath(item, userConfig.uploadPath),
        item: item,
        acl: userConfig.acl || "public-read",
        urlPrefix: userConfig.urlPrefix,
      })
    )

    let results: IUploadResult[]

    try {
      results = await Promise.all(tasks)
    } catch (err: any) {
      ctx.log.error("上传到 S3 存储发生错误，请检查网络连接和配置是否正确")
      ctx.log.error(err)
      ctx.emit("notification", {
        title: "S3 存储上传错误",
        body: "请检查配置是否正确",
        text: "",
      })
      throw err
    }

    for (const result of results) {
      const { index, url, imgURL } = result
      delete output[index].buffer
      delete output[index].base64Image
      output[index].imgUrl = imgURL
      output[index].url = url
    }

    return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const defaultConfig: IAwsS3PListUserConfig = {
    accessKeyID: "",
    secretAccessKey: "",
    bucketName: "",
    uploadPath: "{year}/{month}/{md5}.{extName}",
    pathStyleAccess: false,
    rejectUnauthorized: true,
    acl: "public-read",
  }
  let userConfig = ctx.getConfig<IAwsS3PListUserConfig>('picBed.aws-s3-plist') || {}
  userConfig = { ...defaultConfig, ...userConfig }
  const config: IPluginConfig[] = [
    {
      name: "accessKeyID",
      type: "input",
      default: userConfig.accessKeyID,
      required: true,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACCESSKEYID') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACCESSKEYID') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_ACCESSKEYID') },
    },
    {
      name: "secretAccessKey",
      type: "input",
      default: userConfig.secretAccessKey,
      required: true,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_SECRET_ACCESSKEY') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_SECRET_ACCESSKEY') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_SECRET_ACCESSKEY') },
    },
    {
      name: "bucketName",
      type: "input",
      default: userConfig.bucketName,
      required: true,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_BUCKET') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_BUCKET') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_BUCKET') },
    },
    {
      name: "uploadPath",
      type: "input",
      default: userConfig.uploadPath,
      required: true,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_UPLOADPATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_UPLOADPATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_UPLOADPATH') },
    },
    {
      name: "region",
      type: "input",
      default: userConfig.region,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REGION') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REGION') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_REGION') },
    },
    {
      name: "endpoint",
      type: "input",
      default: userConfig.endpoint,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ENDPOINT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ENDPOINT') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_ENDPOINT') },
    },
    {
      name: "proxy",
      type: "input",
      default: userConfig.proxy,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PROXY') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PROXY') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_PROXY') },
    },
    {
      name: "urlPrefix",
      type: "input",
      default: userConfig.urlPrefix,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_URLPREFIX') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_URLPREFIX') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_URLPREFIX') },
    },
    {
      name: "pathStyleAccess",
      type: "confirm",
      default: userConfig.pathStyleAccess || false,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PATHSTYLEACCESS') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_PATHSTYLEACCESS') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_PATHSTYLEACCESS') },
    },
    {
      name: "rejectUnauthorized",
      type: "confirm",
      default: userConfig.rejectUnauthorized || true,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REJECTUNAUTHORIZED') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_REJECTUNAUTHORIZED') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_REJECTUNAUTHORIZED') },
    },
    {
      name: "acl",
      type: "input",
      default: userConfig.acl || "public-read",
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_ACL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_ACL') },
    },
    {
      name: "disableBucketPrefixToURL",
      type: "input",
      default: userConfig.disableBucketPrefixToURL || false,
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_DISABLEBUCKETPREFIXTOURL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_DISABLEBUCKETPREFIXTOURL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST_MESSAGE_DISABLEBUCKETPREFIXTOURL') },
    },
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('aws-s3-plist', {
    get name () {
      return ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST')
    },
    handle,
    config
  })
}
