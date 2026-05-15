#!/bin/bash
# CVM 首次启动幂等初始化 — 由 .github/workflows/deploy-app.yml 远程跑 sudo bash
#
# 做的事:
#   1. 装 docker + docker compose
#   2. 把第一块数据盘(/dev/vdb)格式化为 ext4,挂到 /data,持久化到 /etc/fstab
#   3. 准备 /data/mongo (供 mongo 容器持久化)
#   4. 把 ubuntu 用户加 docker 组(避免 sudo)
#
# 幂等设计:每一步都先 check,已存在/已配则跳过。多跑无副作用。

set -euo pipefail

log() { echo "[server-init] $*"; }

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  log "安装 docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "docker 已装,跳过"
fi

# ubuntu 加 docker 组(下次登录生效)
if ! id -nG ubuntu | grep -qw docker; then
  usermod -aG docker ubuntu
  log "ubuntu 已加入 docker 组"
fi

# ---------- 2. 数据盘 ----------
DATA_DEV=/dev/vdb
DATA_MNT=/data

if [ ! -b "$DATA_DEV" ]; then
  log "ERROR: 数据盘 $DATA_DEV 不存在,检查 terraform/cvm 模块是否挂载"
  exit 1
fi

# 没有文件系统才格式化
if ! blkid "$DATA_DEV" >/dev/null 2>&1; then
  log "格式化 $DATA_DEV 为 ext4..."
  mkfs.ext4 -F "$DATA_DEV"
else
  log "$DATA_DEV 已有文件系统,跳过格式化"
fi

# 挂载点
mkdir -p "$DATA_MNT"

# fstab 持久化
UUID=$(blkid -s UUID -o value "$DATA_DEV")
if ! grep -q "$UUID" /etc/fstab; then
  log "写入 /etc/fstab"
  echo "UUID=$UUID $DATA_MNT ext4 defaults,nofail 0 2" >> /etc/fstab
fi

# 挂载(已挂则 mount -a 是 no-op)
mountpoint -q "$DATA_MNT" || mount "$DATA_MNT"
log "$DATA_MNT 已挂载:"
df -h "$DATA_MNT" | tail -1

# ---------- 3. Mongo data dir ----------
mkdir -p "$DATA_MNT/mongo"
# mongo:7 镜像内 uid 999 = mongodb
chown -R 999:999 "$DATA_MNT/mongo"

# ---------- 4. 部署目录 ----------
mkdir -p /opt/mogu_express
chown ubuntu:ubuntu /opt/mogu_express

log "完成 ✓"
