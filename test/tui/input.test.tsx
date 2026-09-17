import { cleanup, render } from 'ink-testing-library'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TextField } from '../../src/tui/input'

afterEach(cleanup)
const ready = () => new Promise(resolve => setTimeout(resolve, 40))

function InputFixture({ initial, submit, mask }: { initial: string; submit: (value: string) => void; mask?: string }) {
  const [value, setValue] = useState(initial)
  return <TextField width={24} value={value} onChange={setValue} onSubmit={submit} mask={mask} />
}

describe('single-line terminal input', () => {
  it('keeps a long path on one line and submits the complete value', async () => {
    const value = `"C:\\${'Long folder\\'.repeat(20)}photo.png"`
    const submit = vi.fn()
    const ui = render(<InputFixture initial={value} submit={submit} />)
    await ready()
    expect(ui.lastFrame()!.split('\n')).toHaveLength(1)
    expect(ui.lastFrame()).toContain('photo.png')
    expect(ui.lastFrame()!.length).toBeLessThanOrEqual(24)
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith(value))
  })

  it('replaces an existing value using Ctrl+U without inserting shortcut letters', async () => {
    const submit = vi.fn()
    const ui = render(<InputFixture initial='old value' submit={submit} />)
    await ready()
    ui.stdin.write('\u0015')
    await ready()
    ui.stdin.write('new value')
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith('new value'))
  })

  it('edits graphemes and supports forward delete', async () => {
    const submit = vi.fn()
    const ui = render(<InputFixture initial='A👩‍💻B' submit={submit} />)
    await ready()
    ui.stdin.write('\u0001')
    await ready()
    ui.stdin.write('\u001B[C')
    await ready()
    ui.stdin.write('\u001B[3~')
    await ready()
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith('AB'))
  })

  it('masks a long saved credential throughout editing', async () => {
    const submit = vi.fn()
    const credential = 'test-private-value'.repeat(100)
    const ui = render(<InputFixture initial={credential} submit={submit} mask='*' />)
    await ready()
    expect(ui.frames.join('')).not.toContain('test-private-value')
    expect(ui.lastFrame()!.split('\n')).toHaveLength(1)
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith(credential))
  })
})
