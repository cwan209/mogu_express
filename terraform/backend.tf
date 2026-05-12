# State 后端 — Terraform Cloud(免费版)
#
# 多 workspace 模式:用 tags 而不是固定 name,这样可以本地 `terraform workspace select <env>`
# 或 CI 用 `TF_WORKSPACE=staging` 环境变量切换。
#
# 工作流:
#   organization = mogu-express
#   workspaces tags = ["mogu-express"]
#   实际 workspace = mogu-staging / mogu-prod(分别管 staging / prod state)
#
# 切换方法:
#   本地:terraform workspace select mogu-staging
#   CI:  export TF_WORKSPACE=mogu-staging

terraform {
  cloud {
    organization = "mogu-express"
    workspaces {
      tags = ["mogu-express"]
    }
  }
}
