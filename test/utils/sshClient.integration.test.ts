import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { Server, utils } from 'ssh2-no-cpu-features'
import { expect, it } from 'vitest'

import SSHClient from '../../src/utils/sshClient'

interface RemoteEntry {
  mode: number
  uid: number
  gid: number
  data?: Buffer
}

it('uses the installed client against an SFTP-only server and preserves existing files on failure', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const entries = new Map<string, RemoteEntry>([['/existing', { mode: 0o40700, uid: 1000, gid: 1000 }]])
  const { OPEN_MODE, STATUS_CODE } = utils.sftp
  let execRequests = 0
  let failWrites = false
  const server = new Server({ hostKeys: [privateKey] }, connection => {
    connection.on('authentication', auth => auth.accept())
    connection.on('ready', () => {
      connection.on('session', accept => {
        const session = accept()
        session.on('exec', (_accept, reject) => {
          execRequests++
          reject()
        })
        session.on('sftp', accept => {
          const sftp = accept()
          const handles = new Map<string, string>()
          let nextHandle = 0
          const stat = (id: number, remote: string) => {
            const entry = entries.get(remote)
            if (!entry) return sftp.status(id, STATUS_CODE.NO_SUCH_FILE)
            sftp.attrs(id, {
              mode: entry.mode,
              uid: entry.uid,
              gid: entry.gid,
              size: entry.data?.length || 0,
              atime: 0,
              mtime: 0,
            })
          }
          sftp.on('STAT', stat)
          sftp.on('LSTAT', stat)
          sftp.on('MKDIR', (id, remote, attrs) => {
            if (entries.has(remote)) return sftp.status(id, STATUS_CODE.FAILURE)
            entries.set(remote, { mode: 0o40000 | (attrs.mode ?? 0o755), uid: 1000, gid: 1000 })
            sftp.status(id, STATUS_CODE.OK)
          })
          sftp.on('OPEN', (id, remote, flags) => {
            let entry = entries.get(remote)
            if (entry && flags & OPEN_MODE.EXCL) return sftp.status(id, STATUS_CODE.FAILURE)
            if (!entry) {
              entry = { mode: 0o100600, uid: 1000, gid: 1000, data: Buffer.alloc(0) }
              entries.set(remote, entry)
            }
            if (flags & OPEN_MODE.TRUNC) entry.data = Buffer.alloc(0)
            const handle = Buffer.from(String(++nextHandle))
            handles.set(handle.toString(), remote)
            sftp.handle(id, handle)
          })
          sftp.on('WRITE', (id, handle, offset, data) => {
            const entry = entries.get(handles.get(handle.toString())!)!
            const buffer = Buffer.alloc(Math.max(entry.data!.length, offset + data.length))
            entry.data!.copy(buffer)
            data.copy(buffer, offset)
            entry.data = buffer
            sftp.status(id, failWrites ? STATUS_CODE.FAILURE : STATUS_CODE.OK)
          })
          sftp.on('CLOSE', (id, handle) => {
            handles.delete(handle.toString())
            sftp.status(id, STATUS_CODE.OK)
          })
          sftp.on('SETSTAT', (id, remote, attrs) => {
            const entry = entries.get(remote)!
            if (attrs.mode !== undefined) entry.mode = (entry.mode & 0o170000) | attrs.mode
            if (attrs.uid !== undefined) entry.uid = attrs.uid
            if (attrs.gid !== undefined) entry.gid = attrs.gid
            sftp.status(id, STATUS_CODE.OK)
          })
          // This fixture advertises SFTP v3 without the optional POSIX rename extension.
          sftp.on('RENAME', (id, source, destination) => {
            if (entries.has(destination)) return sftp.status(id, STATUS_CODE.FAILURE)
            entries.set(destination, entries.get(source)!)
            entries.delete(source)
            sftp.status(id, STATUS_CODE.OK)
          })
          sftp.on('REMOVE', (id, remote) => {
            entries.delete(remote)
            sftp.status(id, STATUS_CODE.OK)
          })
        })
      })
    })
  })
  const directory = await mkdtemp(path.join(os.tmpdir(), 'piclist-sftp-integration-'))
  const client = new SSHClient()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const config = { host: '127.0.0.1', port: (server.address() as AddressInfo).port, username: 'fixture' }
    const local = path.join(directory, 'image.png')
    await writeFile(local, 'complete image')
    await client.connect(config)
    await client.upload(local, '/existing/photo.png', config)
    await client.upload(local, '/new/nested/photo.png', {
      ...config,
      fileMode: '0644',
      dirMode: '0755',
      fileUser: '1000:1001',
    })

    expect(entries.get('/existing/photo.png')?.data?.toString()).toBe('complete image')
    expect(entries.get('/existing')?.mode).toBe(0o40700)
    expect(entries.get('/new/nested')?.mode).toBe(0o40755)
    expect(entries.get('/new/nested/photo.png')).toMatchObject({ mode: 0o100644, uid: 1000, gid: 1001 })

    await writeFile(local, 'replacement image')
    await expect(client.upload(local, '/existing/photo.png', config)).rejects.toThrow(
      'does not support atomic replacement',
    )
    failWrites = true
    await expect(client.upload(local, '/existing/photo.png', config)).rejects.toThrow()

    expect(entries.get('/existing/photo.png')?.data?.toString()).toBe('complete image')
    expect([...entries.keys()].some(remote => remote.includes('.piclist-upload-'))).toBe(false)
    expect(execRequests).toBe(0)
  } finally {
    client.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
