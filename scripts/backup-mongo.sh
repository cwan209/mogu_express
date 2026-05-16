#!/usr/bin/env bash
#
# Mongo 备份 → COS
#
# 部署:VPS 上 /opt/mogu_express/scripts/backup-mongo.sh
# 定时:cron @ 03:00 daily(由 server-init.sh 自动写入 /etc/cron.d/mogu-backup)
#
# 前置(deploy workflow 已注入 /opt/mogu_express/deploy/.env):
#   - S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET                (COS 子账号)
#   - S3_REGION 或 S3_ENDPOINT(取 region)
#   - MONGO_ROOT_USER / MONGO_ROOT_PASSWORD                    (mongo root 凭证)
#   - ENV_NAME                                                  (staging / prod)
#
# COS 路径:cos://<bucket>/backup/<env>/<YYYY-MM-DD-HHMM>.gz
# Lifecycle(terraform/modules/cos):30d → STANDARD_IA / 60d → ARCHIVE / 365d → 删
#
# 退出码:
#   0  成功
#   1  环境变量缺失
#   2  mongodump 失败
#   3  上传失败

set -euo pipefail

ENV_FILE=${ENV_FILE:-/opt/mogu_express/deploy/.env}
MONGO_CONTAINER=${MONGO_CONTAINER:-mogu_mongo}
DB_NAME=${DB_NAME:-mogu_express}
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(S3_|ENV_NAME)' "$ENV_FILE" || true)
  set +a
fi

: "${S3_ACCESS_KEY:?need S3_ACCESS_KEY}"
: "${S3_SECRET_KEY:?need S3_SECRET_KEY}"
: "${S3_BUCKET:?need S3_BUCKET}"

# S3_REGION 可能不在 .env 里(只有 S3_ENDPOINT),从 endpoint 解析
S3_REGION=${S3_REGION:-$(echo "${S3_ENDPOINT:-}" | sed -nE 's|https?://cos\.([^.]+)\.myqcloud\.com.*|\1|p')}
: "${S3_REGION:?could not resolve S3_REGION from env or S3_ENDPOINT}"

DATE=$(date +%Y-%m-%d-%H%M)
ENV_TAG=${ENV_NAME:-unknown}
DUMP_FILE="/tmp/mogu-${ENV_TAG}-${DATE}.gz"

echo "${LOG_PREFIX} mongodump start (db=${DB_NAME}, env=${ENV_TAG})"

# docker exec 跑 mongodump(mongo 无 auth,内网容器隔离)
if ! docker exec "$MONGO_CONTAINER" mongodump \
      --db "$DB_NAME" \
      --archive --gzip > "$DUMP_FILE"; then
  echo "${LOG_PREFIX} mongodump FAILED"
  rm -f "$DUMP_FILE"
  exit 2
fi

SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || wc -c < "$DUMP_FILE")
echo "${LOG_PREFIX} mongodump OK (${SIZE} bytes)"

# coscli 配置(幂等)— 注意 coscli 默认读 ~/.cos.yaml 单文件,不是 ~/.cos/config.yaml
COS_CONFIG_FILE="$HOME/.cos.yaml"
cat > "$COS_CONFIG_FILE" <<EOF
cos:
  base:
    secretid: $S3_ACCESS_KEY
    secretkey: $S3_SECRET_KEY
    sessiontoken: ""
    protocol: https
  buckets:
    - name: $S3_BUCKET
      alias: app
      region: $S3_REGION
      endpoint: ""
EOF
chmod 600 "$COS_CONFIG_FILE"

REMOTE_PATH="cos://app/backup/${ENV_TAG}/${DATE}.gz"
echo "${LOG_PREFIX} uploading to ${REMOTE_PATH}"

if ! coscli cp "$DUMP_FILE" "$REMOTE_PATH"; then
  echo "${LOG_PREFIX} upload FAILED"
  rm -f "$DUMP_FILE"
  exit 3
fi
echo "${LOG_PREFIX} upload OK"

rm -f "$DUMP_FILE"
echo "${LOG_PREFIX} backup done: cos://${S3_BUCKET}/backup/${ENV_TAG}/${DATE}.gz"
