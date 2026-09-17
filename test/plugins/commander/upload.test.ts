import os from 'node:os'
import path from 'node:path'

import { Command } from 'commander'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import upload from '../../../src/plugins/commander/upload'
import type { IPicGo } from '../../../src/types'

describe('upload CLI inputs', () => {
  let baseDir: string
  let ctx: {
    cmd: { program: Command }
    uploadReturnCtx: ReturnType<typeof vi.fn>
    log: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
  }

  const run = async (...args: string[]) => ctx.cmd.program.parseAsync(args, { from: 'user' })

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-upload-cli-'))
    ctx = {
      cmd: { program: new Command() },
      uploadReturnCtx: vi.fn().mockResolvedValue({}),
      log: { warn: vi.fn(), error: vi.fn() },
    }
    upload.handle(ctx as unknown as IPicGo)
  })

  afterEach(async () => {
    await fs.remove(baseDir)
  })

  it.each(['upload', 'u'])('does not start an upload for a missing file via %s', async command => {
    const missing = path.join(baseDir, 'does-not-exist.png')

    await run(command, missing)

    expect(ctx.log.warn).toHaveBeenCalledWith(`${missing} does not exist.`)
    expect(ctx.uploadReturnCtx).not.toHaveBeenCalled()
  })

  it('does not start an upload when all supplied files are missing', async () => {
    await run('upload', path.join(baseDir, 'missing-one.png'), path.join(baseDir, 'missing-two.png'))

    expect(ctx.log.warn).toHaveBeenCalledTimes(2)
    expect(ctx.uploadReturnCtx).not.toHaveBeenCalled()
  })

  it('still requests a clipboard upload when no inputs are supplied', async () => {
    await run('upload')

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([])
    expect(ctx.log.warn).not.toHaveBeenCalled()
  })

  it('uploads an existing local file', async () => {
    const file = path.join(baseDir, 'image with spaces.png')
    await fs.writeFile(file, 'test image')

    await run('upload', path.relative(process.cwd(), file))

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([file])
  })

  it('uploads a URL without requiring a local file', async () => {
    const url = 'https://example.com/image.png'

    await run('upload', url)

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([url])
    expect(ctx.log.warn).not.toHaveBeenCalled()
  })

  it('still uploads valid files and URLs when other inputs are missing', async () => {
    const file = path.join(baseDir, 'image.png')
    const missing = path.join(baseDir, 'missing.png')
    const url = 'https://example.com/image.png'
    await fs.writeFile(file, 'test image')

    await run('upload', missing, file, url)

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([file, url])
    expect(ctx.log.warn).toHaveBeenCalledWith(`${missing} does not exist.`)
  })
})
