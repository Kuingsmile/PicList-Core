import { type IPicGo, type IPicGoPlugin } from '../../types'
import SMMSUploader from './smms'
import tcYunUploader from './tcyun'
import githubUploader from './github'
import qiniuUploader from './qiniu'
import imgurUploader from './imgur'
import aliYunUploader from './aliyun'
import upYunUploader from './upyun'
import webdavplistUploader from './webdav'
import localUploader from './local'
import sftpUploader from './sftp'
import telegraphUploader from './telegraph'
import piclistUploader from './piclist'

const buildInUploaders: IPicGoPlugin = () => {
  return {
    register (ctx: IPicGo) {
      aliYunUploader(ctx)
      tcYunUploader(ctx)
      SMMSUploader(ctx)
      githubUploader(ctx)
      qiniuUploader(ctx)
      imgurUploader(ctx)
      upYunUploader(ctx)
      webdavplistUploader(ctx)
      localUploader(ctx)
      sftpUploader(ctx)
      telegraphUploader(ctx)
      piclistUploader(ctx)
    }
  }
}

export default buildInUploaders
