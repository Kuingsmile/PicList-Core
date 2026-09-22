import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as piclist from 'piclist'
import * as deepPiclist from 'piclist/dist/index.js'
import sharp from 'sharp'

assert.deepEqual(Object.keys(piclist).sort(), [
  'Commander',
  'Lifecycle',
  'LifecyclePlugins',
  'Logger',
  'PicGo',
  'PicGoUtils',
  'PluginHandler',
  'PluginLoader',
  'Request',
])
assert.equal(piclist.PicGo, deepPiclist.PicGo)
assert.equal(piclist.PicGoUtils.getMd5('consumer'), '1005b14bd29466723ace30d26f602f5b')
assert.equal(typeof (await import('piclist/dist/tui.js')).startTui, 'function')
// These public paths must remain accessible without an exports allowlist.
assert.ok(import.meta.resolve('piclist/bin/picgo'))
assert.ok(import.meta.resolve('piclist/bin/picgo-server'))
assert.ok(import.meta.resolve('piclist/package.json'))

const helpDirectory = mkdtempSync(path.join(tmpdir(), 'piclist-cli-help-'))
try {
  const configPath = path.join(helpDirectory, 'config.json')
  const cliPath = fileURLToPath(import.meta.resolve('piclist/bin/picgo'))
  const pkg = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('piclist/package.json')), 'utf8'))
  assert.equal(
    execFileSync(process.execPath, [cliPath, '--config', configPath, '--version'], { encoding: 'utf8' }).trim(),
    pkg.version,
  )
  const serverPath = fileURLToPath(import.meta.resolve('piclist/bin/picgo-server'))
  assert.match(execFileSync(process.execPath, [serverPath, '--help'], { encoding: 'utf8' }), /picgo-server/)

  // Node's runtime environment must remain dynamic even in production bundles.
  const originalNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'development'
    assert.equal(piclist.PicGoUtils.isDev(), true)
    process.env.NODE_ENV = 'production'
    assert.equal(piclist.PicGoUtils.isDev(), false)
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  }

  const destination = path.join(helpDirectory, 'uploaded')
  writeFileSync(
    configPath,
    JSON.stringify({ settings: { language: 'en' }, picBed: { current: 'local', local: { path: destination } } }),
  )
  const client = await piclist.PicGo.create(configPath)
  client.setConfig({ silent: true })
  assert.equal(client.VERSION, pkg.version)
  const input = await sharp({ create: { width: 64, height: 64, channels: 4, background: 'white' } })
    .png()
    .toBuffer()
  // Exercise import.meta.url asset lookup after bundling and an actual upload without remote services.
  const watermarked = await piclist.PicGoUtils.AddWatermark(input, 'image', '')
  assert.equal((await sharp(watermarked).metadata()).width, 64)
  const inputPath = path.join(helpDirectory, 'fixture.png')
  writeFileSync(inputPath, watermarked)
  const uploaded = await client.upload([inputPath])
  assert.ok(Array.isArray(uploaded))
  assert.equal(uploaded.length, 1)
  assert.deepEqual(readFileSync(path.join(destination, 'fixture.png')), watermarked)

  const { startTui } = await import('piclist/dist/tui.js')
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    await assert.rejects(startTui(client), /interactive terminal/)
  }

  for (const [language, upload, tui, help] of [
    ['en', 'upload, go go go', 'open the interactive terminal interface', 'display help for command'],
    ['zh-CN', '上传图片', '打开交互式终端界面', '显示命令帮助'],
    ['zh-TW', '上傳圖片', '開啟互動式終端介面', '顯示命令說明'],
  ]) {
    writeFileSync(configPath, JSON.stringify({ settings: { language } }))
    const output = execFileSync(process.execPath, [cliPath, '--config', configPath, '--help'], { encoding: 'utf8' })
    assert.ok(output.includes(upload))
    assert.ok(output.includes(tui))
    assert.ok(output.includes(help))
    assert.ok(!output.includes('CLI_'))
  }
} finally {
  // Only remove the directory created by mkdtempSync above.
  rmSync(helpDirectory, { recursive: true, force: true })
}
