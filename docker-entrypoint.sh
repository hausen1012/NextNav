#!/bin/sh
set -e

# 如果以 root 身份启动容器，自动确保数据目录存在、修正权限并降权给 app 用户执行
if [ "$(id -u)" = '0' ]; then
    mkdir -p "${DATA_DIR:-/app/data}/icons"
    chown -R app:app "${DATA_DIR:-/app/data}"
    exec su-exec app /app/nextnav "$@"
fi

exec /app/nextnav "$@"
