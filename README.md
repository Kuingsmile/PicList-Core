# 🖼️ PicList-Core

English | [简体中文](./README_cn.md)

![standard](https://img.shields.io/badge/code%20style-standard-green.svg?style=flat-square)
![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)
![node](https://img.shields.io/badge/node-%3E%3D16.0.0-blue?style=flat-square)

![picgo-core](https://cdn.jsdelivr.net/gh/Molunerfinn/test/picgo/picgo-core-fix.jpg)

PicList-Core is a powerful image uploading toolkit that offers both CLI and API interfaces. Built upon PicGo-Core, it brings enhanced functionality while maintaining full plugin compatibility. Check out [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) for an extensive collection of plugins.

For detailed documentation, visit [PicList-Core DeepWiki](https://deepwiki.com/Kuingsmile/PicList-Core/).

**Seamless Typora integration supported**.

## ✨ Enhanced Features

### 🖼️ Advanced Image Processing
- Powerful image manipulation capabilities:
  - Configure via intuitive CLI commands:
    - `picgo set buildin watermark`: Customize watermark settings
    - `picgo set buildin compress`: Fine-tune compression parameters
  - All processing occurs in the `beforeTransform` phase, ensuring seamless plugin compatibility.

### 📝 Smart Renaming System
Customize your file naming patterns using `picgo set buildin rename`. Available variables:

| Variable       | Description                   | Example Value         |
|----------------|-------------------------------|-----------------------|
| `{filename}`   | Original filename (no ext)    | `image`               |
| `{extname}`    | File extension (with dot)     | `.jpg`                |
| `{timestamp}`  | Current timestamp (ms)        | `1717029203156`       |
| `{uuid}`       | Random generated UUID         | `550e8400-e29b-41d4-a716-446655440000` |
| `{date:format}`| Custom date (ISO8601 format)  | `{date:yyyy-MM-dd}`   |

> ⚠️ **Filename Restrictions**:
> Windows: Characters /, \, :, *, ?, ", <, >, | are not allowed
>
> macOS/Linux: Forward slash (/) and null characters are forbidden. On Linux, filenames cannot begin with a hyphen (-)
>
> When using {date:format}, ensure to avoid illegal characters

#### 🎯 Pattern Examples
```bash
# Timestamp + original filename
format: {timestamp}-{filename}

# Date-based directory structure + UUID
format: {date:yyyy/MM/dd}/{uuid}

# Combined pattern
format: backup_{filename}_{timestamp}{extname}
```
### 🚀 Extended Image Hosting
Built-in support for additional hosting services:
- WebDAV integration
- SFTP protocol
- Local storage
- AWS S3 compatibility
- Enhanced Imgur support with account authentication

### 🔧 Additional Improvements

- Built-in server functionality matching PicList-Desktop capabilities, accessible via `picgo-server`
- Multiple stability improvements and bug fixes from PicGo-Core

## 📥 Installation

PicList requires Node.js >= 16

### ⚙️ Prerequisites

PicList depends on [sharp](https://sharp.pixelplumbing.com/). Install it first:

```bash
npm config set sharp_binary_host "https://npmmirror.com/mirrors/sharp"
npm config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips"
npm install sharp
```

### 🌐 Global Installation

```bash
npm install piclist -g

# or

yarn global add piclist
```

### 📦 Local Installation

```bash
npm install piclist -D

# or

yarn add piclist -D
```

## 🚀 Usage Guide

### 🐳 Docker Integration

Run PicList-Core in a Docker container for consistent deployment.

#### 🐋 Docker Run

Customize `./piclist` path for your `config.json` location and replace `piclist123456` with your secure key:

```bash
docker run -d \
  --name piclist \
  --restart always \
  -p 36677:36677 \
  -v "./piclist:/root/.piclist" \
  kuingsmile/piclist:latest \
  node /usr/local/bin/picgo-server -k piclist123456
```

#### 📄 Docker Compose

Get `docker-compose.yml` from the repository or use this configuration:

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

Customize the `./piclist` path and security key in the `command` section.

Deploy with:

```bash
docker-compose up -d
```

#### 🔌 Plugin Management in Docker

Install plugins using Docker exec:

```bash
docker exec -it piclist sh
picgo install picgo-plugin-xxx
```

#### ⚙️ Configuration in Docker

Modify settings through Docker exec:

```bash
docker exec -it piclist sh
picgo set xxx
```

### 🖥️ Server Deployment

Launch the server with `picgo-server` (default port: 36677).

Start the service:

```bash
picgo-server
node ./bin/picgo-server
```

> 🔒 Security Note: Always use the `--key` parameter to prevent unauthorized access, e.g., `picgo-server --key 123456`

Command Reference:

```bash
$ picgo-server -h

  Usage: picgo-server [options]

  Options:

    -h, --help          display help information
    -c, --config        specify config path
    -p, --port          set custom port (default: 36677)
    --host              set host address (default: 0.0.0.0)
    -k, --key           set security key for access control
    -v, --version       show version information

  Examples:
    picgo-server -c /path/to/config.json
    picgo-server -k 123456
    picgo-server -c /path/to/config.json -k 123456
```

#### 🔗 API Endpoints

- `/upload?picbed=xxx&key=xxx` Handle image uploads (`picbed`: hosting service, `key`: authentication)
- `/heartbeat` Service health check

### 💻 CLI Operations

> PicList-Core defaults to `SM.MS` as the image hosting service.

Command Reference:

```bash
$ picgo -h

  Usage: picgo [options] [command]

  Options:

    -v, --version                 display version
    -d, --debug                   enable debug mode
    -s, --silent                  enable silent mode
    -c, --config <path>           specify config path
    -h, --help                    show help

  Commands:

    install|add <plugins...>             install plugin(s)
    uninstall|rm <plugins...>            remove plugin(s)
    update <plugins...>                  update plugin(s)
    set|config <module> [name]           configure module
    upload|u [input...]                  start upload
    use [module]                         select module
    init [options] <template> [project]  create picgo plugin\'s development templates
```

#### 📤 Path-based Upload

```bash
picgo upload /xxx/xx/xx.jpg
```

#### 📋 Clipboard Upload

> Note: Clipboard images are automatically converted to PNG format

```bash
picgo upload
```

### 📚 Node.js Integration

#### 🔄 CommonJS

```js
const { PicGo } = require('piclist')
```

#### 📦 ES Modules

```js
import { PicGo } from 'piclist'
```

#### 📝 API Examples

```js
const picgo = new PicGo()

// Upload from file path
picgo.upload(['/xxx/xxx.jpg'])

// Upload from clipboard
picgo.upload()
```

## 📖 Documentation

For comprehensive documentation, visit the [PicGo-Core Documentation](https://picgo.github.io/PicGo-Core-Doc/).
