import { checkbox, confirm, input, password, select } from '@inquirer/prompts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createInquirerAdapter } from '../../src/utils/inquirerShim'

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}))

describe('legacy inquirer adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('passes input validation, transformation and prefix through and stringifies defaults', async () => {
    const validate = vi.fn(() => true)
    const transformer = vi.fn((value: string) => value.toUpperCase())
    vi.mocked(input).mockResolvedValue('42')

    const answers = await createInquirerAdapter().prompt([
      { type: 'input', name: 'port', message: 'Port', default: 42, prefix: '>', validate, transformer },
    ])

    expect(answers).toEqual({ port: '42' })
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: 'Port', default: '42', validate, transformer, theme: { prefix: '>' } },
      {},
    )
  })

  it('uses the field name as the message without inventing a default or theme', async () => {
    vi.mocked(input).mockResolvedValue('answer')

    await createInquirerAdapter().prompt([{ type: 'input', name: 'field' }])

    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: 'field', default: undefined, validate: undefined, transformer: undefined, theme: undefined },
      {},
    )
  })

  it('uses the password prompt with validation', async () => {
    const validate = vi.fn(() => true)
    vi.mocked(password).mockResolvedValue('synthetic-password')

    const answers = await createInquirerAdapter().prompt([{ type: 'password', name: 'secret', validate }])

    expect(answers).toEqual({ secret: 'synthetic-password' })
    expect(password).toHaveBeenCalledExactlyOnceWith({ message: 'secret', mask: false, validate, theme: undefined }, {})
    expect(input).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, undefined],
    [0, false],
    [1, true],
  ])('converts confirm default %s to %s and preserves false answers', async (defaultValue, expectedDefault) => {
    vi.mocked(confirm).mockResolvedValue(false)

    const answers = await createInquirerAdapter().prompt([{ type: 'confirm', name: 'enabled', default: defaultValue }])

    expect(answers).toEqual({ enabled: false })
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      { message: 'enabled', default: expectedDefault, theme: undefined },
      {},
    )
  })

  it.each(['list', 'rawlist'])('normalizes %s choices while preserving their values', async type => {
    vi.mocked(select).mockResolvedValue(7)

    const answers = await createInquirerAdapter().prompt([
      { type, name: 'uploader', choices: ['local', { name: 'Remote', value: 7 }], default: 7 },
    ])

    expect(answers).toEqual({ uploader: 7 })
    expect(select).toHaveBeenCalledExactlyOnceWith(
      {
        message: 'uploader',
        choices: [
          { name: 'local', value: 'local' },
          { name: 'Remote', value: 7 },
        ],
        default: 7,
        theme: undefined,
      },
      {},
    )
  })

  it('supports a list without choices', async () => {
    await createInquirerAdapter().prompt([{ type: 'list', name: 'uploader' }])

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ choices: [] }), {})
  })

  it('marks only default checkbox values as checked and forwards validation', async () => {
    const validate = vi.fn(() => true)
    vi.mocked(checkbox).mockResolvedValue(['remote'])

    const answers = await createInquirerAdapter().prompt([
      {
        type: 'checkbox',
        name: 'plugins',
        choices: ['local', { name: 'Remote', value: 'remote' }],
        default: ['remote'],
        validate,
      },
    ])

    expect(answers).toEqual({ plugins: ['remote'] })
    expect(checkbox).toHaveBeenCalledExactlyOnceWith(
      {
        message: 'plugins',
        choices: [
          { name: 'local', value: 'local', checked: false },
          { name: 'Remote', value: 'remote', checked: true },
        ],
        validate,
        theme: undefined,
      },
      {},
    )
  })

  it.each([undefined, 'local'])('ignores non-array checkbox default %s', async defaultValue => {
    vi.mocked(checkbox).mockResolvedValue([])

    const answers = await createInquirerAdapter().prompt([
      { type: 'checkbox', name: 'plugins', choices: ['local'], default: defaultValue },
    ])

    expect(answers).toEqual({ plugins: [] })
    expect(checkbox).toHaveBeenCalledWith(
      expect.objectContaining({ choices: [{ name: 'local', value: 'local', checked: false }] }),
      {},
    )
  })

  it('evaluates async guards against previous filtered answers and skips hidden fields', async () => {
    vi.mocked(input).mockResolvedValueOnce('  remote  ').mockResolvedValueOnce('bucket')
    const hiddenFilter = vi.fn()
    const answers = await createInquirerAdapter().prompt([
      { type: 'input', name: 'uploader', filter: (value: string) => value.trim() },
      { type: 'input', name: 'hidden', when: false, filter: hiddenFilter },
      { type: 'password', name: 'localOnly', when: async answers => answers.uploader === 'local' },
      { type: 'input', name: 'bucket', when: async answers => answers.uploader === 'remote' },
    ])

    expect(answers).toEqual({ uploader: 'remote', bucket: 'bucket' })
    expect(input).toHaveBeenCalledTimes(2)
    expect(password).not.toHaveBeenCalled()
    expect(hiddenFilter).not.toHaveBeenCalled()
  })

  it('keeps empty and zero filtered answers and supports an explicit true guard', async () => {
    vi.mocked(input).mockResolvedValueOnce('').mockResolvedValueOnce('0')

    const answers = await createInquirerAdapter().prompt([
      { type: 'input', name: 'empty', when: true },
      { type: 'input', name: 'count', filter: Number },
    ])

    expect(answers).toEqual({ empty: '', count: 0 })
  })

  it.each([undefined, 0])('falls back to input for unknown types with default %s', async defaultValue => {
    vi.mocked(input).mockResolvedValue('fallback')

    const answers = await createInquirerAdapter().prompt([{ type: 'custom', name: 'field', default: defaultValue }])

    expect(answers).toEqual({ field: 'fallback' })
    expect(input).toHaveBeenCalledExactlyOnceWith(
      { message: 'field', default: defaultValue === undefined ? undefined : '0', theme: undefined },
      {},
    )
  })

  it('propagates prompt cancellation without asking subsequent questions', async () => {
    const failure = new Error('Prompt cancelled')
    vi.mocked(input).mockRejectedValueOnce(failure)

    await expect(
      createInquirerAdapter().prompt([
        { type: 'input', name: 'first' },
        { type: 'confirm', name: 'second' },
      ]),
    ).rejects.toBe(failure)

    expect(confirm).not.toHaveBeenCalled()
  })

  it('starts each prompt call with fresh answers', async () => {
    const adapter = createInquirerAdapter()
    vi.mocked(input).mockResolvedValueOnce('first')

    expect(await adapter.prompt([{ type: 'input', name: 'field' }])).toEqual({ field: 'first' })
    expect(await adapter.prompt([])).toEqual({})
  })
})
