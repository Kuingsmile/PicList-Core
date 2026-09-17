import assert from 'node:assert/strict'

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
