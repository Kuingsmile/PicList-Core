import { beforeEach, describe, expect, it, vi } from 'vitest'

import SSHClient from '../../src/utils/sshClient'

const ssh = vi.hoisted(() => ({
  connect: vi.fn(),
  isConnected: vi.fn(),
  putFile: vi.fn(),
  execCommand: vi.fn(),
  dispose: vi.fn(),
  requestSFTP: vi.fn(),
}))

const sftp = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  unlink: vi.fn(),
  lstat: vi.fn(),
  rename: vi.fn(),
  ext_openssh_rename: vi.fn(),
}))

/** Finds the temporary destination for a particular transfer. */
const stagedPath = (index = 0): string => ssh.putFile.mock.calls[index][1]

vi.mock('node-ssh-no-cpu-features', () => ({
  NodeSSH: class {
    connect = ssh.connect
    isConnected = ssh.isConnected
    putFile = ssh.putFile
    execCommand = ssh.execCommand
    dispose = ssh.dispose
    requestSFTP = ssh.requestSFTP
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
    ssh.requestSFTP.mockResolvedValue(sftp)
    sftp.open.mockImplementation((_path, _flags, callback) => callback(null, Buffer.from('handle')))
    sftp.close.mockImplementation((_handle, callback) => callback(null))
    sftp.unlink.mockImplementation((_path, callback) => callback(null))
    sftp.ext_openssh_rename.mockImplementation((_source, _destination, callback) => callback(null))
    await client.connect(config)
  })

  it('preserves default upload behavior and Windows path normalization', async () => {
    await client.upload('local.png', '\\images\\photo.png', config)

    expect(stagedPath()).toMatch(/^\/images\/\.piclist-upload-[\da-f-]+\.tmp$/)
    expect(sftp.ext_openssh_rename).toHaveBeenCalledWith(stagedPath(), '/images/photo.png', expect.any(Function))
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
      [`chmod -- '${fileMode}' '${stagedPath()}'`],
    ])
    expect(sftp.ext_openssh_rename).toHaveBeenCalledWith(stagedPath(), '/images/nested/photo.png', expect.any(Function))
  })

  it.each(['0755', '0700'])('quotes directory and file names with directory mode %s', async dirMode => {
    const directory = 'album\'s "$(printf injected)" `printf injected`; &\n文件'
    const remote = `/${directory}/photo'$(printf injected).png`
    const quotedDirectory = "'album'\\''s \"$(printf injected)\" `printf injected`; &\n文件'"
    const quotedAbsoluteDirectory = "'/album'\\''s \"$(printf injected)\" `printf injected`; &\n文件'"
    await client.upload('local.png', remote, { ...config, dirMode, fileMode: '0600' })
    const quotedStagedPath = `'${stagedPath().replace(/'/g, "'\\''")}'`

    expect(ssh.execCommand.mock.calls).toEqual([
      [
        dirMode === '0755'
          ? `cd / && mkdir -p -- ${quotedDirectory}`
          : `test -d ${quotedAbsoluteDirectory} || (mkdir -- ${quotedAbsoluteDirectory} && chmod -- '0700' ${quotedAbsoluteDirectory})`,
      ],
      [`chmod -- '0600' ${quotedStagedPath}`],
    ])
    expect(sftp.ext_openssh_rename).toHaveBeenCalledWith(stagedPath(), remote, expect.any(Function))
  })

  it('quotes permission values without evaluating their shell syntax', async () => {
    const mode = 'u+r; printf injected'
    await client.upload('local.png', '/images/photo.png', { ...config, dirMode: mode, fileMode: mode })

    expect(ssh.execCommand.mock.calls).toEqual([
      ["test -d '/images' || (mkdir -- '/images' && chmod -- 'u+r; printf injected' '/images')"],
      [`chmod -- 'u+r; printf injected' '${stagedPath()}'`],
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
      [`chmod -- '-w' '${stagedPath()}'`],
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
      [`chmod -- '0600' '${stagedPath()}'`],
      [`chmod -- '0600' '${stagedPath(1)}'`],
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

  it.each(['transfer', 'permissions', 'ownership', 'rename'])(
    'preserves an existing remote file when %s fails',
    async stage => {
      const remote = '/images/photo.png'
      const files = new Map([[remote, 'original image']])
      ssh.putFile.mockImplementation(async (_local, destination) => {
        files.set(destination, stage === 'transfer' ? 'partial image' : 'replacement image')
        if (stage === 'transfer') throw new Error('transfer failed')
      })
      ssh.execCommand.mockImplementation(async script => ({
        code:
          (stage === 'permissions' && script.startsWith('chmod ')) ||
          (stage === 'ownership' && script.startsWith('chown '))
            ? 1
            : 0,
      }))
      sftp.ext_openssh_rename.mockImplementation((_source, _destination, callback) =>
        callback(new Error('rename failed')),
      )
      sftp.unlink.mockImplementation((destination, callback) => {
        files.delete(destination)
        callback(null)
      })

      await expect(
        client.upload('local.png', remote, { ...config, fileMode: '0644', fileUser: 'uploads' }),
      ).rejects.toThrow('failed')

      expect([...files]).toEqual([[remote, 'original image']])
      expect(sftp.unlink).toHaveBeenCalledWith(stagedPath(), expect.any(Function))
      expect(sftp.ext_openssh_rename).toHaveBeenCalledTimes(stage === 'rename' ? 1 : 0)
    },
  )

  it('publishes a complete replacement only after ownership and permissions succeed', async () => {
    const remote = '/images/photo.png'
    const files = new Map([[remote, 'original image']])
    ssh.putFile.mockImplementation(async (_local, destination) => files.set(destination, 'replacement image'))
    ssh.execCommand.mockImplementation(async () => {
      expect(files.get(remote)).toBe('original image')
      return { code: 0 }
    })
    sftp.ext_openssh_rename.mockImplementation((source, destination, callback) => {
      expect(files.get(remote)).toBe('original image')
      files.set(destination, files.get(source)!)
      files.delete(source)
      callback(null)
    })

    await client.upload('local.png', remote, { ...config, fileMode: '0644', fileUser: 'uploads' })

    expect([...files]).toEqual([[remote, 'replacement image']])
    expect(sftp.open).toHaveBeenCalledWith(stagedPath(), 'wx', expect.any(Function))
    expect(ssh.putFile).toHaveBeenCalledWith('local.png', stagedPath(), sftp)
    expect(ssh.execCommand.mock.calls.slice(-2)).toEqual([
      [`chown -- 'uploads:uploads' '${stagedPath()}'`],
      [`chmod -- '0644' '${stagedPath()}'`],
    ])
    expect(sftp.unlink).not.toHaveBeenCalled()
  })

  it('rejects replacement when the server has no POSIX rename extension', async () => {
    sftp.ext_openssh_rename.mockImplementation(() => {
      throw new Error('Server does not support this extended request')
    })
    sftp.lstat.mockImplementation((_path, callback) => callback(null, {}))

    await expect(client.upload('local.png', '/images/photo.png', config)).rejects.toThrow(
      'does not support atomic replacement',
    )

    expect(sftp.rename).not.toHaveBeenCalled()
    expect(sftp.unlink).toHaveBeenCalledWith(stagedPath(), expect.any(Function))
  })

  it.each([false, true])('uses standard rename for a new file and handles a destination race (%s)', async race => {
    sftp.ext_openssh_rename.mockImplementation((_source, _destination, callback) => callback({ code: 8 }))
    sftp.lstat.mockImplementation((_path, callback) => callback({ code: 2 }))
    sftp.rename.mockImplementation((_source, _destination, callback) =>
      callback(race ? new Error('File exists') : null),
    )

    const upload = client.upload('local.png', '/images/photo.png', config)
    if (race) await expect(upload).rejects.toThrow('File exists')
    else await expect(upload).resolves.toBeUndefined()

    expect(sftp.rename).toHaveBeenCalledWith(stagedPath(), '/images/photo.png', expect.any(Function))
    expect(sftp.unlink.mock.calls.every(([destination]) => destination === stagedPath())).toBe(true)
  })

  it('does not delete an unowned temporary file if exclusive creation fails', async () => {
    sftp.open.mockImplementation((_path, _flags, callback) => callback(new Error('File exists')))

    await expect(client.upload('local.png', '/images/photo.png', config)).rejects.toThrow('File exists')

    expect(ssh.putFile).not.toHaveBeenCalled()
    expect(sftp.unlink).not.toHaveBeenCalled()
  })

  it('keeps the transfer error when remote cleanup also fails', async () => {
    ssh.putFile.mockRejectedValueOnce(new Error('transfer interrupted'))
    sftp.unlink.mockImplementation((_path, callback) => callback(new Error('connection lost')))

    await expect(client.upload('local.png', '/images/photo.png', config)).rejects.toThrow('transfer interrupted')
    expect(sftp.ext_openssh_rename).not.toHaveBeenCalled()
  })

  it('uses distinct temporary files for concurrent replacements', async () => {
    await Promise.all([
      client.upload('first.png', '/images/photo.png', config),
      client.upload('second.png', '/images/photo.png', config),
    ])

    expect(stagedPath()).not.toBe(stagedPath(1))
    expect(sftp.ext_openssh_rename).toHaveBeenCalledTimes(2)
  })

  it.each(['0755', '0700'])('does not try to create the remote root with mode %s', async dirMode => {
    await client.upload('local.png', '/photo.png', { ...config, dirMode })

    expect(ssh.execCommand).not.toHaveBeenCalled()
    expect(sftp.ext_openssh_rename).toHaveBeenCalledWith(stagedPath(), '/photo.png', expect.any(Function))
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
