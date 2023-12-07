FROM node:lts-alpine

RUN yarn config set registry https://registry.npmmirror.com/ && \
    yarn config set sharp_binary_host "https://npmmirror.com/mirrors/sharp" && \
    yarn config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips" && \
    yarn global add piclist && \
    rm -rf /var/cache/apk/* /tmp/*

EXPOSE 36677
