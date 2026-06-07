import { describe, expect, it } from 'vitest'

import registerGithubUploader from '../../../src/plugins/uploader/github'
import registerLocalUploader from '../../../src/plugins/uploader/local'
import registerQiniuUploader from '../../../src/plugins/uploader/qiniu'

type RegisterUploader = (ctx: any) => void

function getRegisteredConfigFields(
  registerUploader: RegisterUploader,
  configKey: string,
  userConfig: Record<string, any>,
): {
  fields: any[]
  translatedKeys: string[]
} {
  let plugin: any
  const translatedKeys: string[] = []
  const ctx = {
    getConfig: (key: string) => (key === configKey ? userConfig : undefined),
    helper: {
      uploader: {
        register: (_name: string, registeredPlugin: any) => {
          plugin = registeredPlugin
        },
      },
    },
    i18n: {
      translate: (key: string) => {
        translatedKeys.push(key)
        return key
      },
    },
  }

  registerUploader(ctx)

  return {
    fields: plugin.config(ctx),
    translatedKeys,
  }
}

function fieldSummary(fields: any[]): { name: string; type: string; default: any; required: boolean }[] {
  return fields.map(field => ({
    name: field.name,
    type: field.type,
    default: field.default,
    required: field.required,
  }))
}

describe('built-in uploader config fields', () => {
  it('should preserve local config fields and lazy i18n getters', () => {
    const { fields, translatedKeys } = getRegisteredConfigFields(registerLocalUploader, 'picBed.local', {
      path: 'D:/images',
      customUrl: 'https://cdn.example.com',
      webPath: 'gallery',
    })

    expect(translatedKeys).toEqual([])
    expect(fieldSummary(fields)).toEqual([
      { name: 'path', type: 'input', default: 'D:/images', required: true },
      { name: 'customUrl', type: 'input', default: 'https://cdn.example.com', required: false },
      { name: 'webPath', type: 'input', default: 'gallery', required: false },
    ])
    expect(fields[0].prefix).toBe('PICBED_LOCAL_PATH')
    expect(fields[0].alias).toBe('PICBED_LOCAL_PATH')
    expect(fields[0].message).toBe('PICBED_LOCAL_MESSAGE_PATH')
    expect(fields[1].message).toBe('PICBED_LOCAL_MESSAGE_CUSTOMURL')
    expect(fields[2].message).toBe('PICBED_LOCAL_MESSAGE_WEBPATH')
  })

  it('should preserve github config fields and custom messages', () => {
    const { fields, translatedKeys } = getRegisteredConfigFields(registerGithubUploader, 'picBed.github', {
      repo: 'owner/repo',
      branch: 'main',
      token: 'token-value',
      path: 'img/',
      webPath: 'raw/',
      customUrl: 'https://cdn.example.com',
    })

    expect(translatedKeys).toEqual([])
    expect(fieldSummary(fields)).toEqual([
      { name: 'repo', type: 'input', default: 'owner/repo', required: true },
      { name: 'branch', type: 'input', default: 'main', required: true },
      { name: 'token', type: 'input', default: 'token-value', required: true },
      { name: 'path', type: 'input', default: 'img/', required: false },
      { name: 'webPath', type: 'input', default: 'raw/', required: false },
      { name: 'customUrl', type: 'input', default: 'https://cdn.example.com', required: false },
    ])
    expect(fields[0].prefix).toBe('PICBED_GITHUB_REPO')
    expect(fields[0].alias).toBe('PICBED_GITHUB_REPO')
    expect(fields[0].message).toBe('PICBED_GITHUB_MESSAGE_REPO')
    expect('message' in fields[2]).toBe(false)
    expect(fields[5].message).toBe('PICBED_GITHUB_MESSAGE_CUSTOMURL')
  })

  it('should preserve qiniu config fields and custom messages', () => {
    const { fields, translatedKeys } = getRegisteredConfigFields(registerQiniuUploader, 'picBed.qiniu', {
      accessKey: 'access-key',
      secretKey: 'secret-key',
      bucket: 'bucket',
      url: 'https://cdn.example.com',
      area: 'z1',
      options: '?imageslim',
      path: 'img/',
    })

    expect(translatedKeys).toEqual([])
    expect(fieldSummary(fields)).toEqual([
      { name: 'accessKey', type: 'input', default: 'access-key', required: true },
      { name: 'secretKey', type: 'input', default: 'secret-key', required: true },
      { name: 'bucket', type: 'input', default: 'bucket', required: true },
      { name: 'url', type: 'input', default: 'https://cdn.example.com', required: true },
      { name: 'area', type: 'input', default: 'z1', required: true },
      { name: 'options', type: 'input', default: '?imageslim', required: false },
      { name: 'path', type: 'input', default: 'img/', required: false },
    ])
    expect(fields[0].prefix).toBe('PICBED_QINIU_ACCESSKEY')
    expect(fields[0].alias).toBe('PICBED_QINIU_ACCESSKEY')
    expect(fields[3].message).toBe('PICBED_QINIU_MESSAGE_URL')
    expect(fields[6].message).toBe('PICBED_QINIU_MESSAGE_PATH')
  })
})
