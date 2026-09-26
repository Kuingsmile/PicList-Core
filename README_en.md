<div align="center">

<img src="./logo.png" alt="PicList" width="96" />

# PicList-Core

**Upload and process images from your terminal, apps, and server.**

[![npm version](https://img.shields.io/npm/v/piclist?style=flat-square)](https://www.npmjs.com/package/piclist)
[![Node.js](https://img.shields.io/badge/Node.js-22.13%2B%20%2822.x%29-5FA04E?style=flat-square)](./package.json)
[![MIT License](https://img.shields.io/github/license/Kuingsmile/PicList-Core?style=flat-square)](./License)

**English** | [简体中文](./README.md)

[Quick start](#quick-start) · [CLI](#cli) · [Configuration](#configuration) · [HTTP server](#http-server) ·
[Docker](#docker) · [Node.js API](#nodejs-api)

</div>

PicList-Core is an image upload toolkit built on PicGo-Core, with an interactive terminal interface, scriptable
commands, a Node.js API, and an HTTP server. It adds image processing, multiple configurations per uploader, and
secondary uploads, while supporting the PicGo plugin ecosystem and configuration files from PicList Desktop.

## Features

- **Flexible uploads** — upload local files, image URLs, or clipboard images; integrate with Typora and other tools.
- **Built-in destinations** — use GitHub, SM.MS, Imgur, Alibaba Cloud OSS, Tencent Cloud COS, Qiniu, Upyun, Amazon S3,
  WebDAV, SFTP, local folders, AList, Lsky Pro, and PicList servers.
- **Multiple accounts** — save named configurations and switch destinations without re-entering credentials.
- **Image processing** — compress, convert formats, add watermarks, and apply custom filename rules before uploading.
- **Secondary uploads** — keep a second copy at another destination, with shared or separate image processing.
- **Extensible and multilingual** — add PicGo plugins and use English, Simplified Chinese, or Traditional Chinese.

## Quick start

Requires **Node.js 22.13.0 or later in the 22.x release line**.

```bash
npm install -g piclist
picgo init
picgo upload ./image.png
```

`picgo init` guides you through choosing an uploader, naming its configuration, and entering connection details. The
saved configuration becomes your default upload destination. Run setup in an interactive terminal.

You can also install with `yarn global add piclist`. Image-processing dependencies, including `sharp`, are included in
the package installation.

The npm package is named `piclist`; its commands are **`picgo`** and **`picgo-server`**.

## CLI

### Upload images

```bash
# Upload one or more files
picgo upload ./image.png "./My Pictures/photo.jpg"

# Upload an image from a URL
picgo upload https://example.com/image.png

# Upload from the clipboard
picgo upload

# Choose a destination and saved configuration for this upload
picgo upload ./image.png --picbed github --configName "Work"
```

`picgo u` is an alias for `picgo upload`. Quote paths containing spaces. Clipboard images are uploaded as PNG files.

`--picbed` and `--configName` apply only to the current upload. Omit `--picbed` to use the current uploader; omit
`--configName` to use that uploader's default configuration. These options also work with URLs, multiple files, and
clipboard uploads.

For Typora, set the custom upload command to `picgo upload` after configuring your destination. Use the full path to the
`picgo` executable if Typora cannot find it.

### Interactive terminal

Run `picgo` or `picgo tui` in an interactive terminal to manage uploads, destinations, processing, and settings. Choose
**Set up a destination** to get started, then upload images and copy their URLs or Markdown links.

| Shortcut                | Action                                         |
| ----------------------- | ---------------------------------------------- |
| `Tab` or `←` / `→`      | Switch sections                                |
| `↑` / `↓`, then `Enter` | Select and open an action                      |
| `/`                     | Search actions                                 |
| `r`                     | Reopen recent upload results                   |
| `c` / `m`               | Copy the selected result's URL / Markdown link |
| `Esc`                   | Cancel the current form                        |
| `q`                     | Quit from the menu                             |

Use `picgo --help` or `picgo <command> --help` for the full command reference. Without an interactive terminal, bare
`picgo` displays help; explicit commands remain available for scripts.

## Configuration

### Configuration file

The CLI and server use `~/.piclist/data.json` by default. If it does not exist, an existing `~/.piclist/config.json` is
used instead. When both files exist, `data.json` takes precedence.

Use `-c` to select another JSON configuration file:

```bash
picgo -c /path/to/data.json init
picgo -c /path/to/data.json upload ./image.png
picgo-server -c /path/to/data.json --host 127.0.0.1
```

### Named configurations

Each uploader can store multiple configurations, such as personal and work accounts. For example, create a GitHub
configuration and make it the active upload destination:

```bash
picgo set uploader github "Work"
picgo use uploader github "Work"
```

| Command                                    | Purpose                            |
| ------------------------------------------ | ---------------------------------- |
| `picgo config list github`                 | List saved GitHub configurations   |
| `picgo config use github "Work"`           | Set GitHub's default configuration |
| `picgo config edit github "Work"`          | Edit a saved configuration         |
| `picgo config show github "Work"`          | Show configuration details         |
| `picgo config rename github "Work" "Team"` | Rename a configuration             |
| `picgo config remove github "Team"`        | Remove a configuration             |

Replace `github` with your uploader's ID. `picgo use uploader` switches the active uploader; `picgo config use` selects
the default configuration within an uploader. Run `picgo config --help` for more options.

### Image processing and secondary uploads

Configure processing with the interactive prompts:

```bash
picgo set buildin compress
picgo set buildin watermark
picgo set buildin rename
```

To upload a second copy, select an existing destination configuration:

```bash
picgo set secondUploader github "Backup"
```

The setup prompts let you enable or disable secondary uploads and choose **shared** processing (reuse the primary
uploader's processed image) or **separate** processing (process the original independently). Run
`picgo set secondUploader` without arguments to choose a destination interactively.

### Plugins and language

Find plugins in [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo), then replace `picgo-plugin-<name>` with the
package you want to use:

```bash
picgo install picgo-plugin-<name>
picgo list
picgo update picgo-plugin-<name>
picgo uninstall picgo-plugin-<name>
```

Use `picgo set plugin` to configure plugins and `picgo use plugins` to enable them. Restart an open terminal interface
or server after changing plugins.

Change the interface and CLI help language with `picgo i18n en`, `picgo i18n zh-CN`, or `picgo i18n zh-TW`.

## HTTP server

Configure an upload destination first, then start the server:

```bash
picgo-server --host 127.0.0.1 --key "your-secret-key"
```

The default port is `36677`. Without `--host`, the server listens on `0.0.0.0`. Use `--key` for remote uploads and
replace `your-secret-key` with your own key; local loopback requests bypass key checks.

| Option                | Purpose                                |
| --------------------- | -------------------------------------- |
| `-c, --config <path>` | Select a JSON configuration file       |
| `-p, --port <port>`   | Set the listening port                 |
| `--host <host>`       | Set the listening address              |
| `-k, --key <key>`     | Set the key for remote upload requests |
| `-h, --help`          | Show server help                       |

Send files with `POST /upload` using `multipart/form-data`:

```bash
curl -X POST "http://127.0.0.1:36677/upload?key=your-secret-key" \
  -F "file=@./image.png"
```

You can also send JSON with `Content-Type: application/json`, for example `{"list":["/absolute/path/image.png"]}`. File
paths must be accessible to the server; image URLs are also accepted. Optional query parameters `picbed` and
`configName` select an uploader and saved configuration for the request. Successful uploads return
`{"success":true,"result":["..."]}`.

Use `GET /heartbeat` to check server availability, or open `http://127.0.0.1:36677/` in a browser for API usage
examples.

## Docker

Run the server with the `kuingsmile/piclist` image and a persistent configuration directory:

```bash
docker run -d \
  --name piclist \
  --restart unless-stopped \
  -p 36677:36677 \
  -v "./piclist:/root/.piclist" \
  kuingsmile/piclist:latest \
  node /usr/local/bin/picgo-server --key "your-secret-key"
```

Replace `your-secret-key` with your own key. The `./piclist` directory stores configuration and installed plugins. Copy
an existing `data.json` (or legacy `config.json`) into it before starting, or configure an uploader in the running
container:

```bash
docker exec -it piclist picgo set uploader
docker exec -it piclist picgo use uploader
docker restart piclist
```

Install plugins with `docker exec -it piclist picgo install picgo-plugin-<name>`, then restart the container to load
them.

<details>
<summary>Docker Compose</summary>

Save this as `compose.yaml`, replacing the key and adjusting the volume path as needed:

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

Configure the destination using the same `docker exec` commands above.

</details>

## Node.js API

Install PicList as a dependency of your application:

```bash
npm install piclist
```

Configure a destination with the CLI first, then use the same configuration from your application. Save the following as
an ES module (`.mjs`, or `.js` in a project with `"type": "module"`):

```js
import { PicGo } from 'piclist'

const picgo = await PicGo.create()
const images = await picgo.upload(['/absolute/path/image.png'])
```

`PicGo.create()` initializes the client before use. Pass a JSON configuration path to load another configuration:
`await PicGo.create('/path/to/data.json')`. Call `await picgo.upload()` without arguments to upload a clipboard image.

<details>
<summary>CommonJS</summary>

Use dynamic `import()` inside an async function:

```js
async function uploadImage() {
  const { PicGo } = await import('piclist')
  const picgo = await PicGo.create()
  return picgo.upload(['/absolute/path/image.png'])
}

uploadImage().catch(console.error)
```

</details>

## Resources

- [PicList website](https://piclist.cn) — documentation and the desktop app.
- [DeepWiki](https://deepwiki.com/Kuingsmile/PicList-Core/) — additional project documentation.
- [Awesome-PicGo](https://github.com/PicGo/Awesome-PicGo) — community plugins and integrations.
- [Releases](https://github.com/Kuingsmile/PicList-Core/releases) — version history.
- [Issues](https://github.com/Kuingsmile/PicList-Core/issues) — bug reports and feature requests.

## License

[MIT](./License). Built on [PicGo-Core](https://github.com/PicGo/PicGo-Core), with thanks to its authors and the PicGo
community.
