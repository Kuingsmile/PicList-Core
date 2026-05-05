FROM node:lts-alpine
ENV TZ=Asia/Shanghai
RUN apk update \
    && apk add --no-cache tzdata \
    && echo "${TZ}" > /etc/timezone \
    && ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && rm /var/cache/apk/*
RUN yarn config set network-timeout 300000 && \
    #apk add g++ make py3-pip && \
    #yarn global add node-gyp && \
    yarn global add piclist && \
    yarn cache clean && \
    rm -rf /var/cache/apk/* /tmp/*

EXPOSE 36677
