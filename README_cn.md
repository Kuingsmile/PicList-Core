# 🖼️ PicList-Core

[English](./README.md) | 简体中文

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D16.0.0-blue?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

PicList-Core 是一个功能强大的图片上传工具，提供 CLI 和 API 两种调用方式。它在 PicGo-Core 的基础上增强了功能，同时保持插件兼容性。查看 [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) 获取丰富的插件资源。

你可以查看 [PiclList-Core 的 DeepWiki](https://deepwiki.com/Kuingsmile/PicList-Core/) 获取更多信息。

**原生支持 Typora 集成**。

## 📑 目录
- [🖼️ PicList-Core](#️-piclist-core)
  - [📑 目录](#-目录)
  - [✨ 增强功能](#-增强功能)
    - [🖼️ 图像处理增强](#️-图像处理增强)
    - [📝 高级重命名支持](#-高级重命名支持)
      - [使用示例](#使用示例)
    - [🚀 支持更多图床类型](#-支持更多图床类型)
    - [🔧 其他](#-其他)
  - [📥 安装](#-安装)
    - [⚙️ 前置条件](#️-前置条件)
    - [🌐 全局安装](#-全局安装)
    - [📦 本地安装](#-本地安装)
  - [🚀 使用方法](#-使用方法)
    - [🐳 Docker](#-docker)
      - [🐋 docker run](#-docker-run)
      - [📄 docker-compose](#-docker-compose)
      - [🔌 在Docker中安装插件](#-在docker中安装插件)
      - [⚙️ 在Docker中更新配置](#️-在docker中更新配置)
    - [🖥️ 服务器](#️-服务器)
      - [🔗 接口](#-接口)
    - [💻 CLI使用](#-cli使用)
      - [📤 从路径上传图片](#-从路径上传图片)
      - [📋 从剪贴板上传图片](#-从剪贴板上传图片)
    - [📚 在Node项目中使用](#-在node项目中使用)
      - [🔄 CommonJS](#-commonjs)
      - [📦 ES模块](#-es模块)
      - [📝 API使用示例](#-api使用示例)
  - [📖 文档](#-文档)

## ✨ 增强功能

### 🖼️ 图像处理增强
- 增加水印、压缩和转换图片格式功能：
  - 使用 CLI 命令设置参数：
    - `picgo set buildin watermark`：设置水印
    - `picgo set buildin compress`：设置压缩参数
  - 所有图像处理在 `beforeTransform` 阶段进行，不会与插件产生冲突。

### 📝 高级重命名支持
你可以通过命令 `picgo set buildin rename` 设置自定义重命名规则，支持以下变量参数：

| 参数名          | 说明                          | 示例值                |
|----------------|-------------------------------|-----------------------|
| `{filename}`   | 原始文件名（不含扩展名）      | `image`               |
| `{extname}`    | 文件扩展名（含点号）          | `.jpg`                |
| `{timestamp}`  | 当前时间戳（毫秒）            | `1717029203156`       |
| `{uuid}`       | 随机生成的 UUID               | `550e8400-e29b-41d4-a716-446655440000` |
| `{date:格式}`  | 自定义格式日期（ISO8601 格式）| `{date:yyyy-MM-dd}`   |

> ⚠️ **文件名限制提醒**：
> Windows: 禁止使用 /, \, :, *, ?, ", <, >, |。
>
> macOS/Linux: 禁止使用 / 和 null 字符。Linux 下还禁止以 - 开头的文件名。
>
> 在使用 {date:格式} 时，请避免直接使用非法字符。

#### 使用示例
```bash
# 使用时间戳 + 原始文件名
format: {timestamp}-{filename}

# 使用日期目录结构 + UUID
format: {date:yyyy/MM/dd}/{uuid}

# 复合参数使用
format: backup_{filename}_{timestamp}{extname}
```

### 🚀 支持更多图床类型
新增以下内置图床支持：
- WebDAV
- SFTP
- 本地路径
- AWS S3
- 增加对imgur账户上传的支持

### 🔧 其他

- 内置服务器功能，与PicList-Desktop服务器相似，你可以使用`picgo-server`启动服务器
- 修复了PicGo-Core的多个错误

## 📥 安装

PicList 需要 Node.js >= 16

### ⚙️ 前置条件

PicList 依赖 [sharp](https://sharp.pixelplumbing.com/)，请先安装它：

```bash
npm config set sharp_binary_host "https://npmmirror.com/mirrors/sharp"
npm config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips"
npm install sharp
```

### 🌐 全局安装

```bash
npm install piclist -g

# 或者

yarn global add piclist
```

### 📦 本地安装

```bash
npm install piclist -D

# 或者

yarn add piclist -D
```

## 🚀 使用方法

### 🐳 Docker

你可以使用Docker运行PicList-Core。

#### 🐋 docker run

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

#### 📄 docker-compose

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

#### 🔌 在Docker中安装插件

你可以使用`docker exec`在Docker中安装插件。

```bash
docker exec -it piclist sh
picgo install picgo-plugin-xxx
```

#### ⚙️ 在Docker中更新配置

你可以使用`docker exec`在Docker中更新配置。

```bash
docker exec -it piclist sh
picgo set xxx
```

### 🖥️ 服务器

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

#### 🔗 接口

- `/upload?picbed=xxx&key=xxx` 上传图片，`picbed`用于设置图床，`key`用于设置密钥
- `/heartbeat` 心跳检测

### 💻 CLI使用

> PicList-Core使用`SM.MS`作为默认上传图床。

显示帮助:

```bash
$ picgo -h

  Usage: picgo [options] [command]

  Options:

    -v, --version                 输出版本号
    -d, --debug                   调试模式
    -s, --silent                  静默模式
    -c, --config <path>           设置配置路径
    -h, --help                    输出使用信息

  Commands:

    install|add <plugins...>             安装picgo插件
    uninstall|rm <plugins...>            卸载picgo插件
    update <plugins...>                  更新picgo插件
    set|config <module> [name]           配置picgo模块
    upload|u [input...]                  上传，开始上传
    use [module]                         使用picgo模块
    init [options] <template> [project]  创建picgo插件的开发模板
```

#### 📤 从路径上传图片

```bash
picgo upload /xxx/xx/xx.jpg
```

#### 📋 从剪贴板上传图片

> 从剪贴板获取的图片将被转换为`png`格式

```bash
picgo upload
```

### 📚 在Node项目中使用

#### 🔄 CommonJS

```js
const { PicGo } = require('piclist')
```

#### 📦 ES模块

```js
import { PicGo } from 'piclist'
```

#### 📝 API使用示例

```js
const picgo = new PicGo()

// 从路径上传图片
picgo.upload(['/xxx/xxx.jpg'])

// 从剪贴板上传图片
picgo.upload()
```

## 📖 文档

获取更多详细信息，请查看[PicGo-Core文档](https://picgo.github.io/PicGo-Core-Doc/)。
