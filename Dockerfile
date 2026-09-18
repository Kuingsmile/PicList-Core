ARG NODE_IMAGE=node:22.21.1-alpine3.22@sha256:b2358485e3e33bc3a33114d2b1bdb18cdbe4df01bd2b257198eb51beb1f026c5

# Test and compile once natively; the packed JavaScript is platform independent.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /build
ENV HUSKY=0

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive --network-timeout 300000
COPY . .
# Invoke TypeScript directly: older release tags do not have a typecheck script.
RUN yarn tsc --noEmit \
    && yarn test \
    && yarn build \
    && mkdir /package \
    && npm pack --ignore-scripts --pack-destination /package \
    && mv /package/piclist-*.tgz /package/piclist.tgz

FROM ${NODE_IMAGE} AS runtime-base
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
    && echo "${TZ}" > /etc/timezone \
    && ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime

FROM runtime-base AS production-dependencies
WORKDIR /dependencies
COPY package.json yarn.lock ./
# Omit the dev-only Husky hook, but retain dependency install scripts so native
# modules are installed for the target architecture using the same lockfile.
RUN npm pkg delete scripts.prepare \
    && yarn install --production --frozen-lockfile --non-interactive --network-timeout 300000

FROM runtime-base AS runtime
COPY --from=production-dependencies /dependencies/node_modules /usr/local/lib/node_modules/piclist/node_modules
COPY --from=build /package/piclist.tgz /tmp/piclist.tgz
COPY --from=build /build/package.json /tmp/piclist-package.json
# Install only the packed checkout and retain the existing global command paths.
RUN tar -xzf /tmp/piclist.tgz -C /usr/local/lib/node_modules/piclist --strip-components=1 \
    && ln -s /usr/local/lib/node_modules/piclist/bin/picgo /usr/local/bin/picgo \
    && ln -s /usr/local/lib/node_modules/piclist/bin/picgo-server /usr/local/bin/picgo-server \
    && node -e "require('node:assert/strict').equal(require('/usr/local/lib/node_modules/piclist/package.json').version, require('/tmp/piclist-package.json').version)" \
    && test "$(picgo --version)" = "$(node -p "require('/tmp/piclist-package.json').version")" \
    && node /usr/local/bin/picgo-server --help \
    && rm /tmp/piclist.tgz /tmp/piclist-package.json \
    && rm -rf /root/.piclist

EXPOSE 36677
