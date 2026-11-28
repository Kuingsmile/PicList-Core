ARG NODE_IMAGE=node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

# Compile once natively; the packed JavaScript is platform independent.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /build
ENV HUSKY=0
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run typecheck \
    && pnpm run build \
    && mkdir /package \
    && pnpm pack --config.ignore-scripts=true --pack-destination /package \
    && mv /package/piclist-*.tgz /package/piclist.tgz

FROM ${NODE_IMAGE} AS runtime-base
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
    && echo "${TZ}" > /etc/timezone \
    && ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime

FROM runtime-base AS production-dependencies
WORKDIR /dependencies
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
# Omit the dev-only Husky hook, but retain dependency install scripts so native
# modules are installed for the target architecture using the same lockfile.
RUN node -e "const fs = require('node:fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); delete pkg.scripts.prepare; fs.writeFileSync('package.json', JSON.stringify(pkg))" \
    && pnpm install --prod --frozen-lockfile

FROM runtime-base AS runtime
COPY --from=production-dependencies /dependencies/node_modules /usr/local/lib/node_modules/piclist/node_modules
COPY --from=build /package/piclist.tgz /tmp/piclist.tgz
COPY --from=build /build/package.json /tmp/piclist-package.json
# The frozen production install already contains the platform's full dependency tree, including WebDAV.
RUN tar --exclude=package/node_modules -xzf /tmp/piclist.tgz -C /usr/local/lib/node_modules/piclist --strip-components=1 \
    && ln -s /usr/local/lib/node_modules/piclist/bin/picgo /usr/local/bin/picgo \
    && ln -s /usr/local/lib/node_modules/piclist/bin/picgo-server /usr/local/bin/picgo-server \
    && node -e "require('node:assert/strict').equal(require('/usr/local/lib/node_modules/piclist/package.json').version, require('/tmp/piclist-package.json').version)" \
    && test "$(picgo --version)" = "$(node -p "require('/tmp/piclist-package.json').version")" \
    && node /usr/local/bin/picgo-server --help \
    && rm /tmp/piclist.tgz /tmp/piclist-package.json \
    && rm -rf /root/.piclist

EXPOSE 36677
