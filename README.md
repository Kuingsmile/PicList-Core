<div align="center">

<img src="./logo.png" alt="PicList" width="96" />

# PicList-Core

**在终端、应用和服务中上传与处理图片。**

[![npm version](https://img.shields.io/npm/v/piclist?style=flat-square)](https://www.npmjs.com/package/piclist)
[![Node.js](https://img.shields.io/badge/Node.js-22.13%2B%20%2822.x%29-5FA04E?style=flat-square)](./package.json)
[![MIT License](https://img.shields.io/github/license/Kuingsmile/PicList-Core?style=flat-square)](./License)

[English](./README_en.md) | **简体中文**

[快速开始](#快速开始) · [命令行与终端界面](#命令行与终端界面) · [配置](#配置) · [HTTP 服务](#http-服务) ·
[Docker](#docker) · [Node.js API](#nodejs-api)

</div>

PicList-Core 是基于 PicGo-Core 的图片上传工具，提供交互式终端界面、命令行、Node.js
API 和 HTTP 服务。它扩展了图片处理、图床多配置和第二图床上传功能，支持 PicGo 插件生态，并兼容 PicList 桌面版配置文件。

## 功能亮点

- **灵活上传** — 支持本地文件、图片 URL 和剪贴板图片，可集成 Typora 等工具。
- **内置多种图床** — 支持 GitHub、SM.MS、Imgur、阿里云 OSS、腾讯云 COS、七牛云、又拍云、Amazon
  S3、WebDAV、SFTP、本地目录、AList、兰空图床和 PicList 服务。
- **多账号管理** — 为每个图床保存多套命名配置，切换上传目标时无需重新输入凭据。
- **图片处理** — 上传前压缩图片、转换格式、添加水印，并按自定义规则重命名。
- **第二图床上传** — 将图片同时保存到另一上传目标，可共享或独立处理图片。
- **插件与多语言** — 支持 PicGo 插件，以及英文、简体中文和繁体中文界面。

## 快速开始

需要 **Node.js 22.13.0 或更高的 22.x 版本**。

```bash
npm install -g piclist
picgo init
picgo upload ./image.png
```

`picgo init` 会引导你选择图床、命名配置并填写连接信息。保存后，该配置将成为默认上传目标。请在交互式终端中运行此命令。

也可以通过 `yarn global add piclist` 安装。`sharp` 等图片处理依赖会随安装包一起安装。

npm 包名为 `piclist`，安装后使用的命令为 **`picgo`** 和 **`picgo-server`**。

## 命令行与终端界面

### 上传图片

```bash
# 上传一个或多个文件
picgo upload ./image.png "./My Pictures/photo.jpg"

# 上传网络图片
picgo upload https://example.com/image.png

# 上传剪贴板图片
picgo upload

# 为本次上传指定图床和已保存的配置
picgo upload ./image.png --picbed github --configName "Work"
```

`picgo u` 是 `picgo upload` 的简写。包含空格的路径需要加引号，剪贴板图片会以 PNG 格式上传。

`--picbed` 和 `--configName` 仅对本次上传生效。省略 `--picbed` 时使用当前图床，省略 `--configName`
时使用该图床的默认配置。这些选项也适用于 URL、多个文件和剪贴板上传。

在 Typora 中，将自定义上传命令设置为 `picgo upload`，并提前配置好上传目标。如果 Typora 找不到
`picgo`，请使用可执行文件的完整路径。

### 交互式终端

在交互式终端中运行 `picgo` 或 `picgo tui`，即可管理上传、上传目标、图片处理和设置。首次使用请选择 **设置上传目标（Set up
a destination）**，随后即可上传图片并复制 URL 或 Markdown 图片链接。

| 快捷键                    | 操作                               |
| ------------------------- | ---------------------------------- |
| `Tab` 或 `←` / `→`        | 切换分组                           |
| `↑` / `↓`，然后按 `Enter` | 选择并打开操作                     |
| `/`                       | 搜索操作                           |
| `r`                       | 查看最近的上传结果                 |
| `c` / `m`                 | 复制所选结果的 URL / Markdown 链接 |
| `Esc`                     | 取消当前表单                       |
| `q`                       | 从菜单退出                         |

使用 `picgo --help` 或 `picgo <command> --help` 查看完整命令说明。在非交互式终端中，直接运行 `picgo`
会显示帮助；指定子命令的调用仍可用于脚本。

## 配置

### 配置文件

CLI 和服务端默认使用 `~/.piclist/data.json`。如果该文件不存在，则使用已有的
`~/.piclist/config.json`。两个文件同时存在时，优先使用 `data.json`。

通过 `-c` 指定其他 JSON 配置文件：

```bash
picgo -c /path/to/data.json init
picgo -c /path/to/data.json upload ./image.png
picgo-server -c /path/to/data.json --host 127.0.0.1
```

### 多配置管理

每个图床可以保存多套配置，例如个人账号和工作账号。以下命令创建一套 GitHub 配置，并将其设为当前上传目标：

```bash
picgo set uploader github "Work"
picgo use uploader github "Work"
```

| 命令                                       | 用途                     |
| ------------------------------------------ | ------------------------ |
| `picgo config list github`                 | 列出 GitHub 的已保存配置 |
| `picgo config use github "Work"`           | 设置 GitHub 的默认配置   |
| `picgo config edit github "Work"`          | 编辑已有配置             |
| `picgo config show github "Work"`          | 查看配置详情             |
| `picgo config rename github "Work" "Team"` | 重命名配置               |
| `picgo config remove github "Team"`        | 删除配置                 |

将 `github` 替换为所需图床的 ID。`picgo use uploader` 用于切换当前图床，`picgo config use`
用于选择某个图床的默认配置。更多选项请运行 `picgo config --help` 查看。

### 图片处理与第二图床

通过交互式提示配置图片处理：

```bash
picgo set buildin compress
picgo set buildin watermark
picgo set buildin rename
```

若要将图片再上传一份到另一图床，请选择已保存的上传目标配置：

```bash
picgo set secondUploader github "Backup"
```

设置过程中可以启用或禁用第二图床，并选择 **共享处理（shared）**（复用主图床处理后的图片）或
**独立处理（separate）**（从原图单独处理）。不带参数运行 `picgo set secondUploader`，即可交互式选择上传目标。

### 插件与语言

在 [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) 中查找插件，并将 `picgo-plugin-<name>`
替换为要使用的插件包名：

```bash
picgo install picgo-plugin-<name>
picgo list
picgo update picgo-plugin-<name>
picgo uninstall picgo-plugin-<name>
```

使用 `picgo set plugin` 配置插件，使用 `picgo use plugins` 启用插件。修改插件后，请重启已打开的终端界面或服务。

通过 `picgo i18n en`、`picgo i18n zh-CN` 或 `picgo i18n zh-TW` 切换界面和命令帮助的语言。

## HTTP 服务

先配置上传目标，再启动服务：

```bash
picgo-server --host 127.0.0.1 --key "your-secret-key"
```

默认端口为 `36677`。省略 `--host` 时，服务监听 `0.0.0.0`。接受远程上传时请使用 `--key`，并将 `your-secret-key`
替换为自己的密钥；本机回环请求不校验密钥。

| 参数                  | 用途                   |
| --------------------- | ---------------------- |
| `-c, --config <path>` | 指定 JSON 配置文件     |
| `-p, --port <port>`   | 设置监听端口           |
| `--host <host>`       | 设置监听地址           |
| `-k, --key <key>`     | 设置远程上传请求的密钥 |
| `-h, --help`          | 显示服务帮助           |

通过 `POST /upload`，以 `multipart/form-data` 格式发送文件：

```bash
curl -X POST "http://127.0.0.1:36677/upload?key=your-secret-key" \
  -F "file=@./image.png"
```

也可以设置 `Content-Type: application/json` 并发送 JSON，例如
`{"list":["/absolute/path/image.png"]}`。文件路径必须能被服务端访问，也支持图片 URL。可选查询参数 `picbed` 和
`configName` 用于为本次请求指定图床和配置。上传成功时返回 `{"success":true,"result":["..."]}`。

通过 `GET /heartbeat` 检查服务是否可用，或在浏览器中打开 `http://127.0.0.1:36677/` 查看接口使用示例。

## Docker

使用 `kuingsmile/piclist` 镜像启动服务，并挂载配置目录以保留数据：

```bash
docker run -d \
  --name piclist \
  --restart unless-stopped \
  -p 36677:36677 \
  -v "./piclist:/root/.piclist" \
  kuingsmile/piclist:latest \
  node /usr/local/bin/picgo-server --key "your-secret-key"
```

将 `your-secret-key` 替换为自己的密钥。`./piclist` 目录用于保存配置和已安装的插件。启动前可将已有的 `data.json`（或旧版
`config.json`）复制到该目录，也可以在运行中的容器内配置图床：

```bash
docker exec -it piclist picgo set uploader
docker exec -it piclist picgo use uploader
docker restart piclist
```

使用 `docker exec -it piclist picgo install picgo-plugin-<name>` 安装插件后，请重启容器以加载插件。

<details>
<summary>Docker Compose</summary>

将以下内容保存为 `compose.yaml`，替换密钥，并按需调整挂载目录：

```yaml
services:
  piclist:
    image: kuingsmile/piclist:latest
    container_name: piclist
    restart: unless-stopped
    ports:
      - '36677:36677'
    volumes:
      - './piclist:/root/.piclist'
    command: ['node', '/usr/local/bin/picgo-server', '--key', 'your-secret-key']
```

```bash
docker compose up -d
```

启动后，可使用上面的 `docker exec` 命令配置上传目标。

</details>

## Node.js API

在应用中安装 PicList 依赖：

```bash
npm install piclist
```

先通过 CLI 配置上传目标，再在应用中使用同一份配置。将以下示例保存为 ES 模块（`.mjs` 文件，或在声明了 `"type": "module"`
的项目中使用 `.js` 文件）：

```js
import { PicGo } from 'piclist'

const picgo = await PicGo.create()
const images = await picgo.upload(['/absolute/path/image.png'])
```

`PicGo.create()` 会在使用前完成客户端初始化。如需加载其他配置，可传入 JSON 文件路径：
`await PicGo.create('/path/to/data.json')`。不带参数调用 `await picgo.upload()`，即可上传剪贴板图片。

<details>
<summary>CommonJS</summary>

在异步函数中使用动态 `import()`：

```js
async function uploadImage() {
  const { PicGo } = await import('piclist')
  const picgo = await PicGo.create()
  return picgo.upload(['/absolute/path/image.png'])
}

uploadImage().catch(console.error)
```

</details>

## 相关资源

- [PicList 官网](https://piclist.cn) — 使用文档与桌面应用。
- [DeepWiki](https://deepwiki.com/Kuingsmile/PicList-Core/) — 更多项目文档。
- [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) — 社区插件与集成。
- [版本发布](https://github.com/Kuingsmile/PicList-Core/releases) — 版本历史。
- [问题反馈](https://github.com/Kuingsmile/PicList-Core/issues) — 报告问题或提出功能建议。

## 许可证

本项目采用 [MIT 许可证](./License)，基于 [PicGo-Core](https://github.com/PicGo/PicGo-Core)
开发，感谢原作者及 PicGo 社区的贡献。
