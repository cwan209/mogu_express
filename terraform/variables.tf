# ===== 顶层变量 =====

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

variable "lighthouse_instance_name" {
  description = "VPS 实例名"
  type        = string
  default     = "mogu-express-prod"
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
