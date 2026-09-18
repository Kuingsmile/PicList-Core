# PicList-Core

[English](./README_en.md) | [简体中文](./README.md)

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

PicList-Core 是一个功能强大的图片上传工具，提供 CLI 和 API 两种调用方式。它在 PicGo-Core 的基础上增强了功能，同时保持插件兼容性。查看 [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) 获取丰富的插件资源。

你可以查看 [PiclList-Core 的 DeepWiki](https://deepwiki.com/Kuingsmile/PicList-Core/) 获取更多信息。

**原生支持 Typora 集成**。

## 增强功能

- **多配置支持**：
  - 每个图床支持多个配置，兼容桌面版PicList配置文件
  - 通过 `picgo config-list <uploader>` 列出所有配置
  - 通过 `picgo config-use <uploader> <configName>` 切换默认配置
  - 通过 `picgo config-remove <uploader> <configName>` 删除配置
  - 通过 `picgo config-rename <uploader> <oldName> <newName>` 重命名配置
  - 通过 `picgo config-show <uploader> [configName]` 查看配置详情

- **第二图床上传**：
  - 通过 `picgo set secondUploader [uploader] [configName]`（或 `picgo config secondUploader`）启用或禁用第二图床上传，并选择已有图床配置
  - 示例：`picgo set secondUploader github "Backup account"`；省略图床或配置名称时会显示选择提示
  - 支持共享主图床处理后的文件（`shared`）或独立处理原始文件（`seperate`，为兼容已有配置保留此拼写）
  - 修改或重命名所选原始配置时会同步更新 `picBed.secondUploaderConfig`；删除原始配置时会清空第二图床选择并禁用第二图床上传

- **图像处理能力**：
  - 添加水印、压缩图片和转换格式
  - 通过 `picgo set buildin watermark` 和 `picgo set buildin compress` CLI 命令进行配置
  - 处理过程发生在 beforeTransform 阶段，确保与所有插件兼容

- **高级重命名**：
  - 通过 `picgo set buildin rename` 设置自定义重命名规则

- **额外内置图床**：
  - WebDAV、SFTP、本地路径、AWS S3
  - 改进的 Imgur 支持，支持账户上传

- **内置服务器**：
  - 类似于 PicList-Desktop 服务器
  - 使用 `picgo-server` 命令启动

- **错误修复**：
  - 解决了原始 PicGo-Core 的多个问题

## 安装

PicList 需要 Node.js >= 22

### 前置条件

PicList 依赖 [sharp](https://sharp.pixelplumbing.com/)，请先安装它：

```bash
npm config set sharp_binary_host "https://npmmirror.com/mirrors/sharp"
npm config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips"
npm install sharp
```

### 全局安装

```bash
npm install piclist -g

# 或者

yarn global add piclist
```

### 本地安装

```bash
npm install piclist -D

# 或者

yarn add piclist -D
```

## 使用方法

### Docker

你可以使用Docker运行PicList-Core。

#### 从源码构建

```bash
docker build -t piclist:local .
docker run --rm piclist:local node -p "require('/usr/local/lib/node_modules/piclist/package.json').version"
```

构建使用固定版本的 Node 22 镜像，按照 `yarn.lock` 安装依赖，运行类型检查和测试后打包当前源码。
运行镜像安装该压缩包及锁定版本的生产依赖。构建和发布流程都会在发布前检查镜像中安装的包版本是否与当前源码的 `package.json` 一致。

#### docker run

将`./piclist`更改为你自己的路径，该路径是放置`config.json`文件的位置，并将`piclist123456`更改为你自己的密钥。

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

从本仓库下载`docker-compose.yml`，或将以下内容复制到`docker-compose.yml`:

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

你可以将`./piclist`更改为你自己的路径，该路径是放置`config.json`文件的位置，并在`command`中更改密钥。

然后运行:

```bash
docker-compose up -d
```

#### 在Docker中安装插件

你可以使用`docker exec`在Docker中安装插件。

```bash
docker exec -it piclist sh
picgo install picgo-plugin-xxx
```

#### 在Docker中更新配置

你可以使用`docker exec`在Docker中更新配置。

```bash
docker exec -it piclist sh
picgo set xxx
```

### 服务器

你可以使用`picgo-server`启动服务器，默认端口为`36677`。

启动服务器:

```bash
picgo-server
node ./bin/picgo-server
```

> 强烈建议添加`--key`参数以避免未经授权的访问。例如：`picgo-server --key 123456`

显示帮助:

```bash
$ picgo-server -h

  Usage: picgo-server [options]

  Options:

    -h, --help          显示帮助信息
    -c, --config        设置配置路径
    -p, --port          设置端口，默认端口为36677
    --host              设置主机，默认主机为0.0.0.0
    -k, --key           设置密钥以避免未经授权的访问
    -v, --version       显示版本号

  Examples:
    picgo-server -c /path/to/config.json
    picgo-server -k 123456
    picgo-server -c /path/to/config.json -k 123456
```

#### 接口

- `/upload?picbed=xxx&key=xxx` 上传图片，`picbed`用于设置图床，`key`用于设置密钥
- `/heartbeat` 心跳检测

### CLI使用

> PicList-Core使用`SM.MS`作为默认上传图床。

在交互式终端中运行 `picgo` 即可打开基于 Ink 的终端界面，也可以使用 `picgo tui` 显式启动。
使用 `picgo -c /path/to/config.json` 指定配置文件。本地开发时先运行 `yarn build`，再运行 `yarn start`。

首次使用也可以运行 `picgo init`，按提示选择图床、输入配置名称和图床参数。完成后，该配置会成为当前默认上传目标。
运行 `picgo -c /path/to/config.json init` 可将设置保存到指定配置文件；默认使用 `~/.piclist/config.json`。
同名配置会在确认后更新，其他配置和设置会保留。凭据输入会隐藏，更新已有配置时需要重新输入凭据。
按 **Ctrl+C** 可取消设置；此命令需要交互式终端。

界面支持文件/URL 和剪贴板上传、图床切换、多配置管理、第二图床、图片处理、转换器、插件、上传代理和语言设置。
首次使用请选择 **设置上传目标（Set up a destination）** 添加图床配置。粘贴包含空格的路径时请加引号，例如
`"C:\My Pictures\photo.png"` 或 `"/home/me/My Pictures/photo.png"`。上传进度和结果链接会显示在界面中。

工作区按 **Upload**、**Destinations**、**Processing**、**Settings** 分组。用 **Tab**、**←/→** 或 **1–4**
切换分组，**↑/↓** 移动，**Enter** 打开操作，**/** 搜索所有操作。首次使用可选择 **Set up a destination** 完成引导设置。

就绪状态会检查上传器的必填字段及已有验证规则，已保存的空令牌仍会提示需要设置。
在 **上传目标 → 检查连接** 中可确认上传小型测试图片，使用当前图片处理和备份设置。
测试图片会保留在各上传目标中，本地临时输入文件会自动清理。

表单提供字段进度、即时校验和选项搜索（**/**）。用 **Space** 切换多选项、**Ctrl+U** 清空输入、**Esc** 取消表单。
按 **r** 查看最近的结果，修改设置后结果仍保留；用 **↑/↓** 选择结果，**c** 复制链接，**m** 复制 Markdown 图片链接，**PgUp/PgDn** 滚动查看长链接。
复制功能在 Windows/WSL 使用 PowerShell，在 macOS 使用 `pbcopy`，在 Linux 使用 `wl-copy`、`xclip` 或 `xsel`。剪贴板不可用时仍可手动复制显示的链接。
在菜单中按 **q** 退出。**Ctrl+C** 会取消表单并退出；如果上传或 npm 操作已经开始，
则等待操作完成后退出。凭据字段会隐藏输入内容，TUI 操作不会将服务商响应或表单值写入 PicList 日志。
修改插件后请重启 PicList 以重新加载插件代码。**设置 → 语言** 会立即更新导航、搜索、快捷键说明和表单，使用已有的英文、简体中文和繁体中文语言系统。

参见 [UI 设计说明](docs/tui-design.md) 和 [交互设计预览](docs/tui-design.html)。

`picgo upload ...`、`picgo set ...` 以及插件提供的命令仍可使用。在非交互环境（如输出被重定向）中，
直接运行 `picgo` 将显示帮助，`picgo tui` 将提示需要交互式终端。`picgo-server` 和 Node API 的使用方式保持不变。

显示帮助:

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
  init                                          set up an uploader interactively
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

#### 从路径上传图片

```bash
picgo upload /xxx/xx/xx.jpg
```

#### 从剪贴板上传图片

> 从剪贴板获取的图片将被转换为`png`格式

```bash
picgo upload
```

### 在Node项目中使用

#### CommonJS

```js
const { PicGo } = require('piclist')
```

#### ES模块

```js
import { PicGo } from 'piclist'
```

#### API使用示例

```js
const picgo = new PicGo()

// 从路径上传图片
picgo.upload(['/xxx/xxx.jpg'])

// 从剪贴板上传图片
picgo.upload()
```

#### 插件中的国际化

`ctx.i18n.t()` 在 TypeScript 中检查内置翻译键和 `${placeholder}` 参数，解构后也会使用当前语言：

```ts
const { t } = ctx.i18n
t('UPLOAD_FAILED')
t('UPLOAD_FAILED_REASON', { code: 403 })
```

插件可以继续使用 `addLocale()` 和 `translate()` 处理自定义或动态生成的翻译键，无需修改现有调用：

```js
ctx.i18n.addLocale('zh-CN', { PIC_MIGRATER_CHOOSE_FILE: '[ZH] Choose File' })
ctx.i18n.addLocale('en', { PIC_MIGRATER_CHOOSE_FILE: 'Choose File' })
ctx.i18n.translate('PIC_MIGRATER_CHOOSE_FILE')
```

`addLocale()` 合并已有语言的翻译，新增语言请使用 `addLanguage()`。两种翻译方法都会读取更新后的翻译，并在消息缺失或为空时返回翻译键。
仍然支持 `i18n-cli/*.yml` 自定义语言文件，注册的翻译仅作用于当前 PicGo 实例。

CLI 命令和选项的说明也会使用配置的语言。运行 `picgo i18n zh-CN`（或 `zh-TW` / `en`），然后查看 `picgo --help` 或
`picgo install --help`。自定义语言可以覆盖 `CLI_*` 翻译键。
