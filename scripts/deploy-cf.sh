#!/usr/bin/env bash
# 批量部署云函数到微信云开发
#
# 前置条件:
#   1. 已开通云开发,拿到 envId(填到环境变量 CLOUD_ENV_ID)
#   2. 已安装 cloudbase-cli: npm i -g @cloudbase/cli
#   3. 已登录: tcb login(扫码授权)
#   4. 已运行 node scripts/sync-lib.js 同步 _lib 共享代码
#
# 用法:
#   CLOUD_ENV_ID=mogu-express-xxxx ./scripts/deploy-cf.sh         # 部署所有
#   CLOUD_ENV_ID=mogu-express-xxxx ./scripts/deploy-cf.sh login   # 单个
#   CLOUD_ENV_ID=mogu-express-xxxx ./scripts/deploy-cf.sh _admin/listAllOrders

set -e

if [ -z "$CLOUD_ENV_ID" ]; then
  echo "错误: 请设置 CLOUD_ENV_ID 环境变量"
  echo "例: CLOUD_ENV_ID=mogu-express-2gXXXXX ./scripts/deploy-cf.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="$ROOT/cloudfunctions"

# 先同步共享 lib(jwt + huepay)到各 _admin/* 函数目录
echo "[1/2] 同步 _lib 到各云函数目录..."
node "$ROOT/scripts/sync-lib.js"

# 列出所有云函数(忽略 _lib / README)
list_functions() {
  cd "$CF_DIR"
  for d in */; do
    d="${d%/}"
    [[ "$d" == "_lib" ]] && continue
    if [ "$d" == "_admin" ] || [ "$d" == "_dev" ]; then
      for sub in "$d"/*/; do
        sub="${sub%/}"
        echo "$sub"
      done
    else
      echo "$d"
    fi
  done
}

deploy_one() {
  local fn="$1"
  local fn_path="$CF_DIR/$fn"
  if [ ! -d "$fn_path" ]; then
    echo "  ⚠ 跳过(目录不存在): $fn"
    return
  fi
  if [ ! -f "$fn_path/index.js" ]; then
    echo "  ⚠ 跳过(无 index.js): $fn"
    return
  fi
  # 云开发函数名不能含 '/',_admin/xxx → _admin_xxx 或 admin_xxx
  # 这里使用云开发原生约定: 子目录展平为下划线
  local cloud_name="${fn//\//_}"
  echo "  → 部署 $fn (云端名: $cloud_name)"
  tcb fn deploy "$cloud_name" \
    --code-secret "" \
    --envId "$CLOUD_ENV_ID" \
    --dir "$fn_path" \
    --force || echo "  ✗ 失败: $fn"
}

echo "[2/2] 部署云函数到环境 $CLOUD_ENV_ID..."

if [ "$#" -gt 0 ]; then
  for fn in "$@"; do
    deploy_one "$fn"
  done
else
  list_functions | while read -r fn; do
    deploy_one "$fn"
  done
fi

echo ""
echo "✅ 部署完成。下一步:"
echo "  1. 云开发控制台 → 云函数 → payCallback / _admin_* 加 HTTP 触发器"
echo "  2. 云开发控制台 → 环境配置 → 环境变量 → 添加 HUEPAY_*, JWT_SECRET, ADMIN_OPENIDS"
echo "  3. 云开发控制台 → 数据库 → 建集合 + 索引(见 docs/cloud-migration.md)"
