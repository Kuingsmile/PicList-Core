import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as piclist from 'piclist'
import * as deepPiclist from 'piclist/dist/index.js'

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
