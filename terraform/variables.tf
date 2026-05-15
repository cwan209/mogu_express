# ===== 顶层变量 =====

variable "env_name" {
  description = "环境名(staging / prod),决定资源命名和域名前缀"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.env_name)
    error_message = "env_name must be one of: staging, prod"
  }
}

variable "tencent_secret_id" {
  description = "腾讯云 SecretId(从 GH Actions secret TENCENTCLOUD_SECRET_ID 注入)"
  type        = string
  sensitive   = true
}

variable "tencent_secret_key" {
  description = "腾讯云 SecretKey"
  type        = string
  sensitive   = true
}

variable "tencent_intl" {
  description = "是否腾讯云国际版账号(intl.cloud.tencent.com)。海外主体走这个"
  type        = bool
  default     = true
}

# ===== Cloudflare DNS =====

variable "cloudflare_api_token" {
  description = "Cloudflare API token(Zone DNS Edit 权限即可)"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID(域名 overview 页面右下角)"
  type        = string
}

# ===== 区域 / 域名 =====

variable "region" {
  description = "腾讯云区域,Lighthouse 香港用 ap-hongkong"
  type        = string
  default     = "ap-hongkong"
}

variable "root_domain" {
  description = "根域名(如 mogu-express.com),DNSPod 接管"
  type        = string
}

# ===== Lighthouse =====

variable "lighthouse_bundle_id" {
  description = "Lighthouse 套餐 id,2C4G HK 默认 bundle_starter_lin_2c4g80g_h_intl"
  type        = string
  default     = "bundle_starter_lin_2c4g80g_h_intl"
}

variable "lighthouse_blueprint_id" {
  description = "Lighthouse 镜像 id,Ubuntu 22.04 LTS HK"
  type        = string
  default     = "lhbp-fdtbngta"
}

variable "lighthouse_instance_name_prefix" {
  description = "VPS 实例名前缀,实际名 = ${prefix}-${env_name}"
  type        = string
  default     = "mogu-express"
}

variable "ssh_public_key" {
  description = "Lighthouse 实例 root 用 SSH 公钥(对应 GH Actions secret SSH_DEPLOY_KEY 的公钥)"
  type        = string
}

# ===== COS =====

variable "cos_bucket_basename" {
  description = "COS bucket 名前缀,实际会拼上腾讯云 appid 后缀。HK region: <basename>-<appid>"
  type        = string
  default     = "mogu-express-images"
}

variable "cos_region" {
  description = "COS 区域,与 VPS 同地最快"
  type        = string
  default     = "ap-hongkong"
}

# ===== MongoDB(TencentDB)=====

variable "mongo_memory" {
  description = "TencentDB Mongo 内存 GB,prod 副本集起步 2,可调到 4/8/16"
  type        = number
  default     = 2
}

variable "mongo_volume" {
  description = "TencentDB Mongo 磁盘 GB,起步 25"
  type        = number
  default     = 25
}

variable "mongo_node_num" {
  description = "副本集节点数(3 = 经典 HA)"
  type        = number
  default     = 3
}

variable "mongo_availability_zone" {
  description = "TencentDB 可用区(同 region 不同 zone)"
  type        = string
  default     = "ap-hongkong-2"
}
