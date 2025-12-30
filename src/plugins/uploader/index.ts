import { IPicGo } from '../../types'
import advancedplistUploader from './advancedplist'
import alistUploader from './alist'
import aliYunUploader from './aliyun'
import awss3plistUploader from './awss3plist'
import githubUploader from './github'
import imgurUploader from './imgur'
import localUploader from './local'
import lskyUploader from './lsky'
import piclistUploader from './piclist'
import qiniuUploader from './qiniu'
import sftpUploader from './sftp'
import smmsUploader from './smms'
import tcYunUploader from './tcyun'
import upYunUploader from './upyun'
import webdavplistUploader from './webdav'

const buildInUploaders = () => {
  return {
    register(ctx: IPicGo) {
      advancedplistUploader(ctx)
      alistUploader(ctx)
      aliYunUploader(ctx)
      awss3plistUploader(ctx)
      githubUploader(ctx)
      imgurUploader(ctx)
      localUploader(ctx)
      lskyUploader(ctx)
      piclistUploader(ctx)
      qiniuUploader(ctx)
      sftpUploader(ctx)
      smmsUploader(ctx)
      tcYunUploader(ctx)
      upYunUploader(ctx)
      webdavplistUploader(ctx)
    },
  }
}

export default buildInUploaders
