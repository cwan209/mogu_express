# State 后端 — Terraform Cloud(免费版)
#
# 首次使用前:
#   1. 注册 Terraform Cloud 账号 https://app.terraform.io
#   2. 创建 organization(如 mogu-express)和 workspace(如 prod)
#   3. workspace 选 "API-driven" 或 "CLI-driven"(VCS 模式也可)
#   4. 本地 `terraform login` 写 token,或 CI 用 TF_API_TOKEN env
#
# 切换为本地 state 调试:注释掉本段 + 删 .terraform 后重 init

terraform {
  cloud {
    organization = "mogu-express"
    workspaces {
      name = "prod"
    }
  }
}
