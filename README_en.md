# PicList-Core

[English](./README_en.md) | [简体中文](./README.md)

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D16.0.0-blue?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

A powerful tool for image uploading with both CLI & API support. PicList-Core extends PicGo-Core with additional features while maintaining plugin compatibility. Check out [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) for a collection of powerful plugins.

You can refer to the [DeepWiki of PiclList-Core](https://deepwiki.com/Kuingsmile/PicList-Core/) for more information.

**Natively supports Typora integration**.

## Enhanced Features

- **Multi-configuration support**:
  - Each uploader supports multiple configurations, compatible with PicList-Desktop config files
  - List all configurations via `picgo config-list <uploader>`
  - Switch default configuration via `picgo config-use <uploader> <configName>`
  - Remove configuration via `picgo config-remove <uploader> <configName>`
  - Rename configuration via `picgo config-rename <uploader> <oldName> <newName>`
  - View configuration details via `picgo config-show <uploader> [configName]`

- **Secondary upload**:
  - Run `picgo set secondUploader [uploader] [configName]` (or `picgo config secondUploader`) to enable or disable secondary upload and select an existing uploader configuration
  - Example: `picgo set secondUploader github "Backup account"`; omitted uploader and configuration names are prompted
  - Choose whether to share the primary uploader's processed files (`shared`) or process the originals separately (`seperate`, retained for config compatibility)
  - Editing or renaming the selected source configuration updates `picBed.secondUploaderConfig`; deleting it clears the secondary selection and disables secondary upload

- **Image processing capabilities**:
  - Add watermarks, compress images, and convert formats
  - Configure via `picgo set buildin watermark` and `picgo set buildin compress` CLI commands
  - Processing happens during beforeTransform phase, ensuring compatibility with all plugins

- **Advanced renaming**:
  - Set custom rename rules via `picgo set buildin rename`

- **Additional built-in image hosting services**:
  - WebDAV, SFTP, Local path, AWS S3
  - Improved Imgur support with account-based uploads

- **Built-in server**:
  - Similar to PicList-Desktop server
  - Launch with `picgo-server` command

- **Bug fixes**:
  - Addresses several issues from the original PicGo-Core

## Installation

PicList requires Node.js >= 22

### Prerequisites

PicList depends on [sharp](https://sharp.pixelplumbing.com/). Install it first:

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

### Docker

You can use docker to run PicList-Core.

#### Build from a checkout

```bash
docker build -t piclist:local .
docker run --rm piclist:local node -p "require('/usr/local/lib/node_modules/piclist/package.json').version"
```

The build uses a pinned Node 22 image, installs dependencies from `yarn.lock`, runs the type check and tests, and packs the
checkout. The runtime installs that tarball with its locked production dependencies. Both the build and release workflow
check the installed package version against the checkout's `package.json` before publishing.

#### docker run

Change the `./piclist` to your own path, this path is where you put your `config.json` file, and change the `piclist123456` to your own secret key.

```bash
docker run -d \
  --name piclist \
  --restart always \
  -p 36677:36677 \
  -v "./piclist:/root/.piclist" \
  kuingsmile/piclist:latest \
  node /usr/local/bin/picgo-server -k piclist123456
```

#### docker-compose

download `docker-compose.yml` from this repo, or copy the following content to `docker-compose.yml`:

```yaml
version: '3.3'

services:
  node:
    image: 'kuingsmile/piclist:latest'
    container_name: piclist
    restart: always
    ports:
      - 36677:36677
    volumes:
      - './piclist:/root/.piclist'
    command: node /usr/local/bin/picgo-server -k piclist123456
```

You can change the `./piclist` to your own path, this path is where you put your `config.json` file, and change the `command` to your own secret key.

Then run:

```bash
docker-compose up -d
```

#### Install plugins in docker

You can use `docker exec` to install plugins in docker.

```bash
docker exec -it piclist sh
picgo install picgo-plugin-xxx
```

#### Change config in docker

You can use `docker exec` to change config in docker.

```bash
docker exec -it piclist sh
picgo set xxx
```

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

Run `picgo` in an interactive terminal to open the Ink interface, or launch it explicitly with `picgo tui`.
Use `picgo -c /path/to/config.json` to open a specific configuration. For local development, run `yarn build`
and then `yarn start`.

The interface supports file/URL and clipboard uploads, uploader switching, named configuration management,
secondary uploads, image processing, transformers, plugins, upload proxies and form languages. Start with
**Uploader configurations** to add your upload destination. Quote pasted paths containing spaces, for example
`"C:\My Pictures\photo.png"` or `"/home/me/My Pictures/photo.png"`. Upload progress and resulting URLs appear in the UI.

The workspace groups actions into **Upload**, **Destinations**, **Processing** and **Settings**. Use **Tab**,
**←/→** or **1–4** to change sections, **↑/↓** to navigate, and **Enter** to open an action. Press **/** to
search all actions. New users can choose **Set up a destination** for guided setup.

Forms show field progress, inline validation and searchable options (**/**). Use **Space** to toggle checkboxes,
**Ctrl+U** to clear a text field, and **Esc** to cancel the current form. **r** reopens recent results even after
changing settings; select a result with **↑/↓** and scroll a long link with **PgUp/PgDn**. **q** quits from the menu. **Ctrl+C** cancels a
form and exits; if an upload or npm operation is already running, PicList waits for it to finish before exiting.
Credentials are masked in forms, and TUI operations do not write provider payloads or form values to PicList logs.
Restart PicList after changing plugins to reload their code. The navigation is in English; the language setting
controls existing uploader and processing forms.

See the [UI design](docs/tui-design.md) and [interactive design study](docs/tui-design.html).

Explicit commands such as `picgo upload ...`, `picgo set ...`, and plugin-provided commands remain available.
Without a terminal (for example, piped output), bare `picgo` prints help; `picgo tui` reports that a terminal is required.
The `picgo-server` command and Node API retain their existing behavior.

Show help:

```bash
$ picgo -h

Usage: picgo [options] [command]

Options:
  -v, --version                                 output the version number
  -d, --debug                                   debug mode
  -s, --silent                                  silent mode
  -c, --config <path>                           set config path
  -p, --proxy <url>                             set proxy for uploading
  -h, --help                                    display help for command

Commands:
  tui                                           open the interactive terminal interface
  list|ls                                       list installed plugins
  install|add [options] <plugins...>            install picgo plugin
  uninstall|rm <plugins...>                     uninstall picgo plugin
  update|up [options] <plugins...>              update picgo plugin
  config-list <uploader>                        list all configs names for an uploader
  config-use <uploader> <configName>            set a config as default for an uploader
  config-remove <uploader> <configName>         remove a config for an uploader
  config-rename <uploader> <oldName> <newName>  rename a config for an uploader
  config-show <uploader> [configName]           show details of a config
  set|config <module> [name] [configName]       configure config of picgo modules, uploader|secondUploader|transformer|plugin|buildin. For uploader, configName is optional (defaults to "Default").
  upload|u [input...]                           upload, go go go
  use [module]                                  use modules of picgo
  i18n [lang]                                   change language, zh-CN, zh-TW, en
  help [command]                                display help for command
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
