import { describe, expect, it } from 'vitest'

import { IBuildInEvent, IBusEvent, ILogType } from '../../src/utils/enum'

describe('ILogType', () => {
  it('should have all expected values', () => {
    expect(ILogType.success).toBe('success')
    expect(ILogType.info).toBe('info')
    expect(ILogType.warn).toBe('warn')
    expect(ILogType.error).toBe('error')
  })

  it('should have exactly 4 members', () => {
    const values = Object.values(ILogType)
    expect(values).toHaveLength(4)
  })
})

describe('IBuildInEvent', () => {
  it('should have all expected event names', () => {
    expect(IBuildInEvent.UPLOAD_PROGRESS).toBe('uploadProgress')
    expect(IBuildInEvent.FAILED).toBe('failed')
    expect(IBuildInEvent.BEFORE_TRANSFORM).toBe('beforeTransform')
    expect(IBuildInEvent.BEFORE_UPLOAD).toBe('beforeUpload')
    expect(IBuildInEvent.AFTER_UPLOAD).toBe('afterUpload')
    expect(IBuildInEvent.FINISHED).toBe('finished')
    expect(IBuildInEvent.INSTALL).toBe('install')
    expect(IBuildInEvent.UNINSTALL).toBe('uninstall')
    expect(IBuildInEvent.UPDATE).toBe('update')
    expect(IBuildInEvent.NOTIFICATION).toBe('notification')
  })

  it('should have exactly 10 members', () => {
    const values = Object.values(IBuildInEvent)
    expect(values).toHaveLength(10)
  })
})

describe('IBusEvent', () => {
  it('should have CONFIG_CHANGE', () => {
    expect(IBusEvent.CONFIG_CHANGE).toBe('CONFIG_CHANGE')
  })

  it('should have exactly 1 member', () => {
    const values = Object.values(IBusEvent)
    expect(values).toHaveLength(1)
  })
})
