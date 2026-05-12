variable "instance_name" { type = string }
variable "bundle_id" { type = string }
variable "blueprint_id" { type = string }
variable "region" { type = string }
variable "ssh_public_key" { type = string }

variable "shop_domain" { type = string }
variable "admin_domain" { type = string }
variable "api_domain" { type = string }

variable "git_repo" {
  description = "应用代码 git 仓库 url(cloud-init 用)"
  type        = string
  default     = "https://github.com/cwan209/mogu_express.git"
}
