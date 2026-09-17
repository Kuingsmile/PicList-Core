import { beforeEach, describe, expect, it, vi } from 'vitest'

import SSHClient from '../../src/utils/sshClient'

const ssh = vi.hoisted(() => ({
  connect: vi.fn(),
  isConnected: vi.fn(),
  putFile: vi.fn(),
  execCommand: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('node-ssh-no-cpu-features', () => ({
  NodeSSH: class {
    connect = ssh.connect
    isConnected = ssh.isConnected
    putFile = ssh.putFile
    execCommand = ssh.execCommand
    dispose = ssh.dispose
  },
}))

describe('SSHClient shell arguments', () => {
  const client = new SSHClient()
  const config = { host: 'example.invalid', username: 'test' }

  beforeEach(async () => {
    vi.resetAllMocks()
    ssh.connect.mockResolvedValue(undefined)
    ssh.isConnected.mockReturnValue(true)
    ssh.putFile.mockResolvedValue(undefined)
    ssh.execCommand.mockResolvedValue({ code: 0 })
    await client.connect(config)
  })

  it('preserves default upload behavior and Windows path normalization', async () => {
    await client.upload('local.png', '\\images\\photo.png', config)

    expect(ssh.putFile).toHaveBeenCalledWith('local.png', '/images/photo.png')
    expect(ssh.execCommand.mock.calls).toEqual([["cd / && mkdir -p -- 'images'"]])
  })

  it.each([
    ['0600', '0700'],
    ['u=rw,go=r', 'u=rwx,go=rx'],
  ])('preserves file mode %s and directory mode %s', async (fileMode, dirMode) => {
    await client.upload('local.png', '/images/nested/photo.png', { ...config, fileMode, dirMode })

    expect(ssh.execCommand.mock.calls).toEqual([
      [`mkdir -- '/images' && chmod -- '${dirMode}' '/images'`],
      [`mkdir -- '/images/nested' && chmod -- '${dirMode}' '/images/nested'`],
      [`chmod -- '${fileMode}' '/images/nested/photo.png'`],
    ])
    expect(ssh.putFile).toHaveBeenCalledWith('local.png', '/images/nested/photo.png')
  })

  it.each(['0755', '0700'])('quotes directory and file names with directory mode %s', async dirMode => {
    const directory = 'album\'s "$(printf injected)" `printf injected`; &\n文件'
    const remote = `/${directory}/photo'$(printf injected).png`
    const quotedDirectory = "'album'\\''s \"$(printf injected)\" `printf injected`; &\n文件'"
    const quotedAbsoluteDirectory = "'/album'\\''s \"$(printf injected)\" `printf injected`; &\n文件'"
    const quotedRemote =
      "'/album'\\''s \"$(printf injected)\" `printf injected`; &\n文件/photo'\\''$(printf injected).png'"

    await client.upload('local.png', remote, { ...config, dirMode, fileMode: '0600' })

    expect(ssh.execCommand.mock.calls).toEqual([
      [
        dirMode === '0755'
          ? `cd / && mkdir -p -- ${quotedDirectory}`
          : `mkdir -- ${quotedAbsoluteDirectory} && chmod -- '0700' ${quotedAbsoluteDirectory}`,
      ],
      [`chmod -- '0600' ${quotedRemote}`],
    ])
    expect(ssh.putFile).toHaveBeenCalledWith('local.png', remote)
  })

  it('quotes permission values without evaluating their shell syntax', async () => {
    const mode = 'u+r; printf injected'
    await client.upload('local.png', '/images/photo.png', { ...config, dirMode: mode, fileMode: mode })

    expect(ssh.execCommand.mock.calls).toEqual([
      ["mkdir -- '/images' && chmod -- 'u+r; printf injected' '/images'"],
      ["chmod -- 'u+r; printf injected' '/images/photo.png'"],
    ])
  })

  it.each([
    ['www-data', undefined, 'www-data:www-data'],
    ['www-data:uploads', undefined, 'www-data:uploads'],
    ['www-data', 'uploads', 'www-data:uploads'],
    ['1000:1001', undefined, '1000:1001'],
  ])('preserves ownership syntax for %s and %s', async (user, group, owner) => {
    await client.chown('\\images\\photo.png', user!, group)

    expect(ssh.execCommand).toHaveBeenCalledWith(`chown -- '${owner}' '/images/photo.png'`)
  })

  it('quotes owner, group and filename metacharacters', async () => {
    await client.chown("/images/photo'$(printf injected).png", "o'wner; printf injected", '`printf injected`')

    expect(ssh.execCommand).toHaveBeenCalledWith(
      "chown -- 'o'\\''wner; printf injected:`printf injected`' '/images/photo'\\''$(printf injected).png'",
    )
  })

  it('ends option parsing before configurable values and paths', async () => {
    await client.upload('local.png', '/-images/photo.png', { ...config, fileMode: '-w' })
    await client.chown('-photo.png', '--reference=other')

    expect(ssh.execCommand.mock.calls).toEqual([
      ["cd / && mkdir -p -- '-images'"],
      ["chmod -- '-w' '/-images/photo.png'"],
      ["chown -- '--reference=other:--reference=other' '-photo.png'"],
    ])
  })

  it('rejects null bytes before sending an ownership command', async () => {
    await expect(client.chown('/images/photo\0.png', 'www-data')).rejects.toThrow('null bytes')
    expect(ssh.execCommand).not.toHaveBeenCalled()
  })
})
