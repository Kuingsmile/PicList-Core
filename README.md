# PicList-Core

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)
[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Fpicgo%2Fpicgo-core%2Fbadge%3Fref%3Dmaster&style=flat-square)](https://actions-badge.atrox.dev/picgo/picgo-core/goto?ref=master)
![npm](https://img.shields.io/npm/v/picgo.svg?style=flat-square)
[![PicGo Convention](https://img.shields.io/badge/picgo-convention-blue.svg?style=flat-square)](https://github.com/PicGo/bump-version)
![node](https://img.shields.io/badge/node-%3E%3D12.0.0-blue?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

A tool for picture uploading. Both CLI & api supports. It also supports plugin system, please check [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) to find powerful plugins.

**Typora supports PicGo-Core natively**.

## 修改列表

* smms, imgur和github图床增加hash返回参数，配合piclist的删除功能
* 增加了webdav内置支持

## Installation

PicList should be installed with node.js >= 12 (v1.5.0-alpha.4 and small) & node.js >= 16 (since v1.5.0-alpha.5).

### Global install

```bash
npm install piclist -g

# or

yarn global add piclist
```

### Local install

```bash
npm install piclist -D

# or

yarn add piclist -D
```

## Usage

### Use in CLI

> PicGo uses `SM.MS` as the default upload pic-bed.

Show help:

```bash
$ picgo -h

  Usage: picgo [options] [command]

  Options:

    -v, --version                 output the version number
    -d, --debug                   debug mode
    -s, --silent                  silent mode
    -c, --config <path>           set config path
    -h, --help                    output usage information

  Commands:

    install|add <plugins...>             install picgo plugin
    uninstall|rm <plugins...>            uninstall picgo plugin
    update <plugins...>                  update picgo plugin
    set|config <module> [name]           configure config of picgo modules
    upload|u [input...]                  upload, go go go
    use [module]                         use modules of picgo
    init [options] <template> [project]  create picgo plugin\'s development templates
```

#### Upload a picture from path

```bash
picgo upload /xxx/xx/xx.jpg
```

#### Upload a picture from clipboard

> picture from clipboard will be converted to `png`

```bash
picgo upload
```

Thanks to [vs-picgo](https://github.com/Spades-S/vs-picgo) && [Spades-S](https://github.com/Spades-S) for providing the method to upload picture from clipboard.

### Use in node project

#### Common JS

```js
const { PicGo } = require('piclist')
```

#### ES Module

```js
import { PicGo } from 'piclist'
```

#### API usage example

```js
const picgo = new PicGo()

// upload a picture from path
picgo.upload(['/xxx/xxx.jpg'])

// upload a picture from clipboard
picgo.upload()
```

## Documentation

For more details, you can checkout [documentation](https://picgo.github.io/PicGo-Core-Doc/).
