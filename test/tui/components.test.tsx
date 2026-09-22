import { cleanup, render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PromptForm } from '../../src/tui/components'

afterEach(cleanup)

// Wait for Ink to subscribe to stdin after committing each frame.
const ready = () => new Promise(resolve => setTimeout(resolve, 40))

describe('Ink forms', () => {
  it.each([false, true])('shows the field label, config key and example with compact=%s', compact => {
    const ui = render(
      <PromptForm
        question={{
          name: 'fileUser',
          type: 'input',
          prefix: '文件用户',
          alias: '文件用户',
          message: '例如: www:data',
          required: false,
        }}
        compact={compact}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(ui.lastFrame()).toContain('文件用户 (fileUser) · optional')
    expect(ui.lastFrame()).toContain('例如: www:data')
  })

  it('filters long option lists before selecting a value', async () => {
    const onSubmit = vi.fn()
    const ui = render(
      <PromptForm
        question={{
          name: 'uploader',
          type: 'list',
          prefix: 'Destination',
          message: 'Choose an uploader',
          choices: ['GitHub', 'S3', 'Local storage'],
        }}
        position={{ current: 2, total: 4 }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    await ready()
    expect(ui.lastFrame()).toContain('Destination (uploader)')
    expect(ui.lastFrame()).toContain('Choose an uploader')
    expect(ui.lastFrame()).toContain('Field 2 / 4')
    ui.stdin.write('/')
    await ready()
    ui.stdin.write('local')
    await vi.waitFor(() => expect(ui.lastFrame()).not.toContain('GitHub'))
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Local storage'))
  })

  it('does not submit when asynchronous validation finishes after cancellation', async () => {
    let finish!: (valid: boolean) => void
    const validate = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve
        }),
    )
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const ui = render(
      <PromptForm
        question={{ name: 'name', type: 'input', default: 'sample', validate }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    )
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(validate).toHaveBeenCalled())
    ui.stdin.write('\u001B')
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalled())
    finish(true)
    await ready()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it.each([
    { name: 'token', type: 'input' },
    { name: 'password', type: 'input' },
    { name: 'credential', type: 'password' },
  ])('shows saved and edited $name values and validates before submitting', async question => {
    const onSubmit = vi.fn()
    const ui = render(
      <PromptForm
        question={{ ...question, default: 'test-sensitive-value', required: true }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    await ready()
    expect(ui.lastFrame()).toContain('test-sensitive-value')
    expect(ui.lastFrame()).not.toContain('*****')
    expect(ui.lastFrame()).not.toContain('PRIVATE INPUT')
    expect(ui.lastFrame()).not.toContain('Input stays hidden')
    ui.stdin.write('\u0015')
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('This field is required.'))
    expect(onSubmit).not.toHaveBeenCalled()
    ui.stdin.write('test-replacement-value')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('test-replacement-value'))
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('test-replacement-value'))
  })

  it('keeps an invalid field open and accepts corrected input', async () => {
    const onSubmit = vi.fn()
    const ui = render(
      <PromptForm question={{ name: 'name', type: 'input', required: true }} onSubmit={onSubmit} onCancel={vi.fn()} />,
    )
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('This field is required.'))
    expect(onSubmit).not.toHaveBeenCalled()
    ui.stdin.write('sample')
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('sample'))
  })

  it('uses the default selection and supports keyboard changes', async () => {
    const onSubmit = vi.fn()
    const ui = render(
      <PromptForm
        question={{ name: 'choice', type: 'list', choices: ['one', 'two', 'three'], default: 'two' }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    await ready()
    expect(ui.lastFrame()).toContain('› two')
    ui.stdin.write('\u001B[B')
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('three'))
  })

  it('toggles checkboxes and defaults destructive confirmations to No', async () => {
    const onSubmit = vi.fn()
    const ui = render(
      <PromptForm
        question={{ name: 'choice', type: 'checkbox', choices: ['one', 'two'], default: ['two'] }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    await ready()
    ui.stdin.write(' ')
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith(['two', 'one']))
    ui.unmount()
    const confirmation = render(
      <PromptForm
        question={{ name: 'confirm', type: 'confirm', default: false }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    await ready()
    confirmation.stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith(false))
  })

  it('cancels with Escape without submitting', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const ui = render(<PromptForm question={{ name: 'name', type: 'input' }} onSubmit={onSubmit} onCancel={onCancel} />)
    await ready()
    ui.stdin.write('\u001B')
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
