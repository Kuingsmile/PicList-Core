# PicList-Core

[English](./README_en.md) | [简体中文](./README.md)

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

PicList-Core 是一个功能强大的图片上传工具，提供 CLI 和 API 两种调用方式。它在 PicGo-Core 的基础上增强了功能，同时保持插件兼容性。查看
[Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) 获取丰富的插件资源。

你可以查看 [PiclList-Core 的 DeepWiki](https://deepwiki.com/Kuingsmile/PicList-Core/) 获取更多信息。

**原生支持 Typora 集成**。

## 增强功能

- **多配置支持**：
  - 每个图床支持多个配置，兼容桌面版PicList配置文件
  - 通过 `picgo config list <uploader>` 列出所有配置
  - 通过 `picgo config use <uploader> <configName>` 切换默认配置
  - 通过 `picgo config remove <uploader> <configName>` 删除配置
  - 通过 `picgo config rename <uploader> <oldName> <newName>` 重命名配置
  - 通过 `picgo config show <uploader> [configName]` 查看配置详情
  - 通过 `picgo config edit <uploader> [configName]` 编辑已有配置（省略配置名称时编辑当前默认配置）

- **第二图床上传**：
  - 通过 `picgo set secondUploader [uploader] [configName]` 启用或禁用第二图床上传，并选择已有图床配置
  - 示例：`picgo set secondUploader github "Backup account"`；省略图床或配置名称时会显示选择提示
  - 支持共享主图床处理后的文件（`shared`）或独立处理原始文件（`separate`，旧配置中的 `seperate` 会自动迁移）
  - 修改或重命名所选原始配置时会同步更新
    `picBed.secondUploaderConfig`；删除原始配置时会清空第二图床选择并禁用第二图床上传

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

构建使用固定版本的 Node 22 镜像，按照 `yarn.lock`
安装依赖，运行类型检查和测试后打包当前源码。运行镜像安装该压缩包及锁定版本的生产依赖。构建和发布流程都会在发布前检查镜像中安装的包版本是否与当前源码的
`package.json` 一致。

#### 使用 GitHub Actions 构建和下载镜像

打开 **Actions → Build Docker Image → Run workflow**，选择要测试的分支（通常为 `dev`）。将 `tag`
留空，即可构建该分支在触发时的最新提交；也可以输入已有的 Git 标签（例如 `v2.4.2`）来构建发布版本。分支构建使用
`sha-<12 位提交哈希>`
作为镜像标签和构建产物文件名的一部分。推送标签不会自动触发此工作流。GitHub 的自定义下拉选项是静态的，因此这里使用可选的文本输入指定标签，再显式检出对应源码；两个架构使用同一个解析后的源码提交。Dockerfile 和
`.dockerignore`
使用工作流所在提交的版本，避免历史 Dockerfile 安装最新 npm 包而不是构建指定标签的源码。大小报告会同时记录源码提交和构建配置提交。

保持 `enable_push` 未勾选，即可在不配置 Docker Hub 凭据、不发布镜像的情况下构建。AMD64 在 `ubuntu-24.04`
上构建和测试，ARM64 在 `ubuntu-24.04-arm` 上原生构建和测试，无需 QEMU；两个架构使用独立的构建缓存。运行摘要会显示各
`.tar.gz` 镜像压缩包的大小和下载链接。构建产物保留 14 天，包含镜像压缩包、`SHA256SUMS`
和大小报告。此处统计的是下载文件的压缩大小，可能与 Docker Hub 显示的压缩层大小不同。

下载并解压对应架构的构建产物后，即可导入本地 Docker（将示例标签替换为 Git 标签或生成的 `sha-…` 镜像标签）：

```bash
sha256sum -c SHA256SUMS
docker load --input piclist-v2.4.2-linux-amd64.tar.gz
docker run --rm kuingsmile/piclist:v2.4.2-amd64 picgo --version
```

需要发布时勾选 `enable_push`。两个架构均通过验证后，工作流直接发布已验证的镜像为 `<image-tag>-amd64` 和
`<image-tag>-arm64`，并合并为多架构 `<image-tag>`，不会重新构建。仅在需要将 `latest` 更新到该版本时勾选
`update_latest`。发布使用仓库密钥 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_ACCESS_TOKEN`。

#### docker run

将`./piclist`更改为你自己的路径，该路径是放置`data.json`（或旧版`config.json`）文件的位置，并将`piclist123456`更改为你自己的密钥。

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

你可以将`./piclist`更改为你自己的路径，该路径是放置`data.json`（或旧版`config.json`）文件的位置，并在`command`中更改密钥。

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
    picgo-server -c /path/to/data.json
    picgo-server -k 123456
    picgo-server -c /path/to/data.json -k 123456
```

#### 接口

- `/upload?picbed=xxx&key=xxx` 上传图片，`picbed`用于设置图床，`key`用于设置密钥
- `/heartbeat` 心跳检测

### CLI使用

> PicList-Core使用`SM.MS`作为默认上传图床。

在交互式终端中运行 `picgo` 即可打开基于 Ink 的终端界面，也可以使用 `picgo tui` 显式启动。使用
`picgo -c /path/to/data.json` 指定配置文件。本地开发时先运行 `yarn build`，再运行 `yarn start`。

CLI 和服务端默认使用 `~/.piclist/data.json`。如果该文件不存在，则继续读取和更新已有的 `~/.piclist/config.json`。
两个文件同时存在时，优先使用 `data.json`。显式指定的配置路径（包括 `-c /path/to/config.json`）仍然有效。

首次使用也可以运行 `picgo init`，按提示选择图床、输入配置名称和图床参数。完成后，该配置会成为当前默认上传目标。运行
`picgo -c /path/to/data.json init` 可将设置保存到指定配置文件；默认按上述规则选择配置文件。
同名配置会在确认后更新，其他配置和设置会保留。凭据输入会隐藏，更新已有配置时需要重新输入凭据。按
**Ctrl+C** 可取消设置；此命令需要交互式终端。

界面支持文件/URL 和剪贴板上传、图床切换、多配置管理、第二图床、图片处理、转换器、插件、上传代理和语言设置。首次使用请选择
**设置上传目标（Set up a destination）** 添加图床配置。粘贴包含空格的路径时请加引号，例如 `"C:\My Pictures\photo.png"`
或 `"/home/me/My Pictures/photo.png"`。上传进度和结果链接会显示在界面中。

工作区按 **Upload**、**Destinations**、**Processing**、**Settings** 分组。用 **Tab**、**←/→** 或 **1–4**
切换分组，**↑/↓** 移动，**Enter** 打开操作，**/** 搜索所有操作。首次使用可选择 **Set up a destination** 完成引导设置。

就绪状态会检查上传器的必填字段及已有验证规则，已保存的空令牌仍会提示需要设置。在 **上传目标 → 检查连接**
中可确认上传小型测试图片，使用当前图片处理和备份设置。测试图片会保留在各上传目标中，本地临时输入文件会自动清理。

表单提供字段进度、即时校验和选项搜索（**/**）。用 **Space** 切换多选项、**Ctrl+U** 清空输入、**Esc** 取消表单。按 **r**
查看最近的结果，修改设置后结果仍保留；用 **↑/↓** 选择结果，**c** 复制链接，**m** 复制 Markdown 图片链接，**PgUp/PgDn**
滚动查看长链接。复制功能在 Windows/WSL 使用 PowerShell，在 macOS 使用 `pbcopy`，在 Linux 使用 `wl-copy`、`xclip` 或
`xsel`。剪贴板不可用时仍可手动复制显示的链接。在菜单中按 **q** 退出。**Ctrl+C**
会取消表单并退出；如果上传或 npm 操作已经开始，则等待操作完成后退出。凭据字段会隐藏输入内容，TUI 操作不会将服务商响应或表单值写入 PicList 日志。修改插件后请重启 PicList 以重新加载插件代码。**设置 → 语言**
会立即更新导航、搜索、快捷键说明和表单，使用已有的英文、简体中文和繁体中文语言系统。

参见 [UI 设计说明](docs/tui-design.md) 和 [交互设计预览](docs/tui-design.html)。

`picgo upload ...`、`picgo set ...` 以及插件提供的命令仍可使用。在非交互环境（如输出被重定向）中，直接运行 `picgo`
将显示帮助，`picgo tui` 将提示需要交互式终端。`picgo-server` 和 Node API 的使用方式保持不变。

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
  config                                       manage saved uploader configurations
  set <module> [name] [configName]              configure config of picgo modules, uploader|secondUploader|transformer|plugin|buildin. For uploader, configName is optional (defaults to "Default").
  upload|u [options] [input...]                 upload, go go go
  use [module] [name] [configName]               use modules of picgo; select an uploader and its default saved config
  i18n [lang]                                   change language, zh-CN, zh-TW, en
  help [command]                                display help for command
```

运行 `picgo config --help` 可查看 `list`、`use`、`remove`、`rename`、`show` 和 `edit` 子命令。

#### 从路径上传图片

```bash
picgo upload /xxx/xx/xx.jpg
```

#### 从剪贴板上传图片

> 从剪贴板获取的图片将被转换为`png`格式

```bash
picgo upload
```

#### 上传到指定图床或命名配置

使用 `--picbed <uploader>` 指定图床，使用 `--configName <name>` 指定已保存的配置。
省略 `--picbed` 时，从当前图床中选择配置；省略 `--configName` 时，使用指定图床的当前配置。
这些选项仅对本次上传生效，不会更改已保存的默认设置，也支持 `u` 别名、URL、多个文件及剪贴板上传。

```bash
picgo upload /xxx/xx/xx.jpg --picbed github
picgo upload /xxx/xx/xx.jpg --picbed aws-s3 --configName "Work account"
picgo upload /xxx/xx/xx.jpg --configName "Work account"
picgo upload --picbed aws-s3 --configName "Work account"
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

`addLocale()` 合并已有语言的翻译，新增语言请使用
`addLanguage()`。两种翻译方法都会读取更新后的翻译，并在消息缺失或为空时返回翻译键。仍然支持 `i18n-cli/*.yml`
自定义语言文件，注册的翻译仅作用于当前 PicGo 实例。

CLI 命令和选项的说明也会使用配置的语言。运行 `picgo i18n zh-CN`（或 `zh-TW` / `en`），然后查看 `picgo --help` 或
`picgo install --help`。自定义语言可以覆盖 `CLI_*` 翻译键。
