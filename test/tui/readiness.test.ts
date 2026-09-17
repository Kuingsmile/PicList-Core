import { describe, expect, it, vi } from 'vitest'

import { invalidFields, uploaderReady } from '../../src/tui/readiness'
import type { IPicGo } from '../../src/types'

describe('uploader readiness', () => {
  it.each([undefined, null, '', ' \t ', []])('rejects empty required values (%j)', async value => {
    expect(
      await invalidFields([{ name: 'token', type: 'input', required: true, default: 'unused-default' }], {
        token: value,
      }),
    ).toEqual(['token'])
  })

  it('respects conditional fields, false/zero values and asynchronous validators', async () => {
    const validate = vi.fn(async (value: unknown) => value === 'valid')
    const fields = [
      {
        name: 'skip',
        type: 'input',
        required: true,
        when: async (answers: Record<string, unknown>) => answers.enabled === true,
      },
      { name: 'enabled', type: 'confirm', required: true },
      { name: 'count', type: 'input', required: true },
      { name: 'token', type: 'input', required: true, validate },
    ]
    expect(await invalidFields(fields, { enabled: false, count: 0, token: 'valid' })).toEqual([])
    expect(await invalidFields(fields, { enabled: true, count: 0, token: 'invalid' })).toEqual(['skip', 'token'])
  })

  it('fails closed for missing plugins or throwing schemas without saving or logging', async () => {
    const get = vi.fn()
    const saveConfig = vi.fn()
    const ctx = {
      helper: { uploader: { get } },
      getConfig: () => ({ token: 'value' }),
      saveConfig,
    } as unknown as IPicGo
    expect(await uploaderReady(ctx, 'test')).toBe(false)
    get.mockReturnValue({
      config: () => {
        throw new Error('private payload')
      },
    })
    expect(await uploaderReady(ctx, 'test')).toBe(false)
    get.mockReturnValue({ config: () => [{ name: 'token', required: true }] })
    expect(await uploaderReady(ctx, 'test')).toBe(true)
    expect(saveConfig).not.toHaveBeenCalled()
  })
})
