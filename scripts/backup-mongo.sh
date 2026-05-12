#!/usr/bin/env bash
#
# Mongo 备份 → 上传 COS
#
# 部署:VPS 上 /opt/mogu_express/scripts/backup-mongo.sh
# 定时:每天 03:00(cron 配置见 cloud-init.yaml.tpl 或 docs/disaster-recovery.md)
#
# 前置:
#   1. /opt/mogu_express/deploy/.env 存在且包含 S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET / S3_REGION
#   2. coscli 已装(cloud-init 已注入)
#   3. mongo 容器以名字 mogu_mongo 运行(docker-compose.production.yml 固定)
#
# 退出码:
#   0  备份+上传成功
#   1  环境变量缺失
#   2  mongodump 失败
#   3  上传失败

set -euo pipefail

ENV_FILE=${ENV_FILE:-/opt/mogu_express/deploy/.env}
MONGO_CONTAINER=${MONGO_CONTAINER:-mogu_mongo}
DB_NAME=${DB_NAME:-mogu_express}
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

if [[ -f "$ENV_FILE" ]]; then
  # 只导出 S3_* 几个变量,避免污染
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(S3_|ENV_NAME)' "$ENV_FILE" || true)
  set +a
fi

: "${S3_ACCESS_KEY:?need S3_ACCESS_KEY}"
: "${S3_SECRET_KEY:?need S3_SECRET_KEY}"
: "${S3_BUCKET:?need S3_BUCKET}"
: "${S3_REGION:?need S3_REGION}"

DATE=$(date +%Y-%m-%d-%H%M)
ENV_TAG=${ENV_NAME:-unknown}
DUMP_FILE="/tmp/mogu-${ENV_TAG}-${DATE}.gz"

echo "${LOG_PREFIX} mongodump start (db=${DB_NAME}, env=${ENV_TAG})"
if ! docker exec "$MONGO_CONTAINER" mongodump --archive --gzip --db "$DB_NAME" > "$DUMP_FILE"; then
  echo "${LOG_PREFIX} mongodump FAILED"
  rm -f "$DUMP_FILE"
  exit 2
fi
SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || wc -c < "$DUMP_FILE")
echo "${LOG_PREFIX} mongodump OK (${SIZE} bytes)"

# coscli 配置写到 ~/.cos.yaml(幂等)
COS_CONFIG_DIR="$HOME/.cos"
mkdir -p "$COS_CONFIG_DIR"
cat > "$COS_CONFIG_DIR/config.yaml" <<EOF
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

echo "${LOG_PREFIX} uploading to cos://${S3_BUCKET}/backup/${DATE}.gz"
if ! coscli cp "$DUMP_FILE" "cos://app/backup/${ENV_TAG}/${DATE}.gz"; then
  echo "${LOG_PREFIX} upload FAILED"
  rm -f "$DUMP_FILE"
  exit 3
fi
echo "${LOG_PREFIX} upload OK"

rm -f "$DUMP_FILE"
echo "${LOG_PREFIX} backup done: cos://${S3_BUCKET}/backup/${ENV_TAG}/${DATE}.gz"
