# PicList-Core

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D16.0.0-blue?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

A tool for picture uploading. Both CLI & api supports. It also supports plugin system, please check [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) to find powerful plugins.

Based on Picgo-Core and add more features.

**Typora support natively**.

## New Features

- Add watermark, compress and convert image format features
  - Set watermark and compress parameters through `picgo set buildin watermark` and `picgo set buildin compress` under CLI command
  - Image processing is beforeTransform, which does not conflict with any plugin
- Add support for advanced rename, you can set the rename rule through `picgo set buildin rename` under the CLI command
- Add new built-in picbed: WebDAV, SFTP, Local path
- Adds support for imgur account uploads
- Built-in server just like PicList-Desktop server, you can use `picgo-server` to start the server
- Fix several bugs of PicGo-Core

## Installation

PicList should be installed with node.js >= 16

### before install

As PicList depends on [sharp](https://sharp.pixelplumbing.com/), you need to install sharp before install PicList.

```bash
npm config set sharp_binary_host "https://npmmirror.com/mirrors/sharp"
npm config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips"
npm install sharp
```

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

### Server

You can use `picgo-server` to start a server, default port is `36677`.

Start server:

```bash
picgo-server
node ./bin/picgo-server
```

> It's highly recommended to add `--key` to avoid unauthorized access. Example: `picgo-server --key 123456`，

Show help:

```bash
$ picgo-server -h

  Usage: picgo-server [options]

  Options:

    -h, --help          Print this help message
    -c, --config        Set config path
    -p, --port          Set port, default port is 36677
    --host              Set host, default host is 0.0.0.0
    -k, --key           Set secret key to avoid unauthorized access
    -v, --version       Print version number

  Examples:
    picgo-server -c /path/to/config.json
    picgo-server -k 123456
    picgo-server -c /path/to/config.json -k 123456
```

#### endpoints

- `/upload?picbed=xxx&key=xxx` upload picture, `picbed` to set pic-bed, `key` to set secret key
- `/heartbeat` heartbeat

### Use in CLI

> PicList-Core uses `SM.MS` as the default upload pic-bed.

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

For more details, you can checkout [documentation of PicGo-Core](https://picgo.github.io/PicGo-Core-Doc/).
