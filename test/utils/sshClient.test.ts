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
    ['0644', '0755'],
    ['0600', '0700'],
    ['u=rw,go=r', 'u=rwx,go=rx'],
  ])('preserves file mode %s and directory mode %s', async (fileMode, dirMode) => {
    await client.upload('local.png', '/images/nested/photo.png', { ...config, fileMode, dirMode })

    expect(ssh.execCommand.mock.calls).toEqual([
      ...(dirMode === '0755'
        ? [["cd / && mkdir -p -- 'images/nested'"]]
        : [
            [`test -d '/images' || (mkdir -- '/images' && chmod -- '${dirMode}' '/images')`],
            [`test -d '/images/nested' || (mkdir -- '/images/nested' && chmod -- '${dirMode}' '/images/nested')`],
          ]),
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
          : `test -d ${quotedAbsoluteDirectory} || (mkdir -- ${quotedAbsoluteDirectory} && chmod -- '0700' ${quotedAbsoluteDirectory})`,
      ],
      [`chmod -- '0600' ${quotedRemote}`],
    ])
    expect(ssh.putFile).toHaveBeenCalledWith('local.png', remote)
  })

  it('quotes permission values without evaluating their shell syntax', async () => {
    const mode = 'u+r; printf injected'
    await client.upload('local.png', '/images/photo.png', { ...config, dirMode: mode, fileMode: mode })

    expect(ssh.execCommand.mock.calls).toEqual([
      ["test -d '/images' || (mkdir -- '/images' && chmod -- 'u+r; printf injected' '/images')"],
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

  it('only prepares a shared directory once while applying each file mode', async () => {
    await client.upload('first.png', '/images/first.png', { ...config, fileMode: '0600' })
    await client.upload('second.png', '\\images\\second.png', { ...config, fileMode: '0600' })

    expect(ssh.execCommand.mock.calls).toEqual([
      ["cd / && mkdir -p -- 'images'"],
      ["chmod -- '0600' '/images/first.png'"],
      ["chmod -- '0600' '/images/second.png'"],
    ])
    expect(ssh.putFile).toHaveBeenCalledTimes(2)
  })

  it('reuses shared parents with custom permissions across sibling directories', async () => {
    const options = { ...config, dirMode: '0700' }
    await client.upload('first.png', '/images/first/photo.png', options)
    await client.upload('second.png', '/images/second/photo.png', options)
    await client.upload('third.png', '/images/first/other.png', options)

    expect(ssh.execCommand.mock.calls).toEqual([
      ["test -d '/images' || (mkdir -- '/images' && chmod -- '0700' '/images')"],
      ["test -d '/images/first' || (mkdir -- '/images/first' && chmod -- '0700' '/images/first')"],
      ["test -d '/images/second' || (mkdir -- '/images/second' && chmod -- '0700' '/images/second')"],
    ])
    expect(ssh.putFile).toHaveBeenCalledTimes(3)
  })

  it('prepares directories again when the requested mode changes', async () => {
    await client.upload('first.png', '/images/first.png', config)
    await client.upload('second.png', '/images/second.png', { ...config, dirMode: '0700' })

    expect(ssh.execCommand.mock.calls).toEqual([
      ["cd / && mkdir -p -- 'images'"],
      ["test -d '/images' || (mkdir -- '/images' && chmod -- '0700' '/images')"],
    ])
  })

  it.each(['0755', '0700'])('does not cache unsuccessful directory setup with mode %s', async dirMode => {
    ssh.execCommand.mockResolvedValueOnce({ code: 1 })
    await expect(client.upload('first.png', '/images/first.png', { ...config, dirMode })).rejects.toThrow(
      'Preparing upload directory failed (exit code: 1)',
    )
    expect(ssh.putFile).not.toHaveBeenCalled()
    await client.upload('second.png', '/images/second.png', { ...config, dirMode })
    await client.upload('third.png', '/images/third.png', { ...config, dirMode })

    expect(ssh.execCommand).toHaveBeenCalledTimes(2)
    expect(ssh.execCommand.mock.calls[0]).toEqual(ssh.execCommand.mock.calls[1])
    expect(ssh.putFile).toHaveBeenCalledTimes(2)
  })

  it('stops at a failed parent setup and retries it on the next upload', async () => {
    ssh.execCommand.mockResolvedValueOnce({ code: 1 })
    const options = { ...config, dirMode: '0700' }
    await expect(client.upload('first.png', '/images/nested/first.png', options)).rejects.toThrow(
      'Preparing upload directory failed',
    )
    expect(ssh.execCommand).toHaveBeenCalledTimes(1)
    await client.upload('second.png', '/images/nested/second.png', options)

    expect(ssh.execCommand).toHaveBeenCalledTimes(3)
    expect(ssh.execCommand.mock.calls[1]).toEqual(ssh.execCommand.mock.calls[0])
  })

  it.each([1, null])('rejects file permission failures with exit code %j', async code => {
    ssh.execCommand.mockResolvedValueOnce({ code: 0 }).mockResolvedValueOnce({ code })

    await expect(client.upload('local.png', '/images/photo.png', { ...config, fileMode: '0644' })).rejects.toThrow(
      'Setting file permissions failed',
    )
  })

  it.each([1, null])('rejects ownership failures with exit code %j', async code => {
    ssh.execCommand.mockResolvedValueOnce({ code })

    await expect(client.chown('/images/photo.png', 'uploads')).rejects.toThrow('Setting file ownership failed')
  })

  it.each(['0755', '0700'])('does not try to create the remote root with mode %s', async dirMode => {
    await client.upload('local.png', '/photo.png', { ...config, dirMode })

    expect(ssh.execCommand).not.toHaveBeenCalled()
    expect(ssh.putFile).toHaveBeenCalledWith('local.png', '/photo.png')
  })

  it('does not reuse directory state after reconnecting', async () => {
    await client.upload('first.png', '/images/first.png', config)
    client.close()
    expect(client.isConnected).toBe(false)
    await client.connect({ ...config, host: 'another.example.invalid' })
    await client.upload('second.png', '/images/second.png', config)

    expect(ssh.execCommand.mock.calls).toEqual([["cd / && mkdir -p -- 'images'"], ["cd / && mkdir -p -- 'images'"]])
  })

  it('keeps directory caches isolated between clients', async () => {
    await client.upload('first.png', '/images/first.png', config)
    const other = new SSHClient()
    await other.connect(config)
    await other.upload('second.png', '/images/second.png', config)

    expect(ssh.execCommand).toHaveBeenCalledTimes(2)
  })

  it('checks the connection even when a directory has already been prepared', async () => {
    await client.upload('first.png', '/images/first.png', config)
    ssh.isConnected.mockReturnValue(false)

    await expect(client.upload('second.png', '/images/second.png', config)).rejects.toThrow('not connected')
    expect(ssh.putFile).toHaveBeenCalledTimes(1)
  })

  it('resets the connection state if reconnecting fails', async () => {
    const failure = new Error('connect failed')
    ssh.connect.mockRejectedValueOnce(failure)

    await expect(client.connect(config)).rejects.toThrow(failure.message)
    expect(client.isConnected).toBe(false)
    await expect(client.upload('local.png', '/images/photo.png', config)).rejects.toThrow('not connected')
    expect(ssh.putFile).not.toHaveBeenCalled()
  })

  it('resets the connection state even if disposal throws', () => {
    ssh.dispose.mockImplementationOnce(() => {
      throw new Error('dispose failed')
    })

    expect(() => client.close()).toThrow('dispose failed')
    expect(client.isConnected).toBe(false)
  })

  it('preserves password authentication and the default port', async () => {
    await client.connect({ ...config, password: 'fixture-password', port: 0 })

    expect(ssh.connect).toHaveBeenLastCalledWith({ ...config, password: 'fixture-password', port: 22 })
  })

  it.each(['fixture-passphrase', ''])('preserves private-key authentication with passphrase %j', async passphrase => {
    await client.connect({ ...config, password: 'unused', privateKey: 'fixture-key', passphrase, port: 2222 })

    expect(ssh.connect).toHaveBeenLastCalledWith({
      ...config,
      port: 2222,
      privateKeyPath: 'fixture-key',
      passphrase: passphrase || undefined,
    })
  })
})
