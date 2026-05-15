# State 后端 — 腾讯云 COS
#
# 鸡蛋问题:state bucket 自己不能用 Terraform 管,必须手动建一次。
#
# 一次性 bootstrap(腾讯云控制台或 cos-cli):
#   1. 登录腾讯云 → 对象存储 COS → 创建存储桶
#      - 名称: mogu-tfstate-<你起的随机后缀>  (实际名腾讯云会拼成 mogu-tfstate-<suffix>-<appid>)
#      - 所属地域: 香港 (ap-hongkong)
#      - 访问权限: **私有读写**(state 含敏感数据,务必私有!)
#      - 版本控制: **开启**(防 state 损坏可回滚)
#   2. 把完整 bucket 名(含 -<appid> 后缀)填到 main bucket 字段下方
#
# State 路径:bucket/terraform/state/<TF_WORKSPACE>.tfstate
# Workspace:`terraform workspace select mogu-staging` 或 `mogu-prod`
#
# 鉴权:provider 从 env TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY 读

terraform {
  backend "cos" {
    region  = "ap-hongkong"
    bucket  = "mogu-tfstate-CHANGEME-200048853243" # ← 把 CHANGEME 替换成你选的随机后缀(6 位即可)
    prefix  = "terraform/state"
    encrypt = true
  }
}
