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

# ===== CVM(VPS,从 Lighthouse 切过来以便加入 mongo VPC 内网)=====

variable "cvm_instance_type" {
  description = "CVM 机型。S5.MEDIUM2 = 2C2G(staging),S5.MEDIUM4 = 2C4G(prod)"
  type        = string
  default     = "S5.MEDIUM4"
}

variable "cvm_instance_name_prefix" {
  description = "CVM 实例名前缀,实际名 = <prefix>-<env_name>"
  type        = string
  default     = "mogu-express"
}

variable "cvm_system_disk_size" {
  description = "系统盘大小 GB"
  type        = number
  default     = 50
}

variable "cvm_internet_max_bandwidth_out" {
  description = "公网出带宽峰值 Mbps(按量计费,只计实际流量)"
  type        = number
  default     = 10
}

variable "ssh_public_key" {
  description = "CVM ubuntu 用户 SSH 公钥(对应 GH Actions secret SSH_DEPLOY_KEY 的公钥)"
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

# ===== CVM AZ(VPC subnet 跟 CVM 同 zone)=====

variable "cvm_availability_zone" {
  description = "CVM 可用区(HK 可选 ap-hongkong-1/-2/-3)"
  type        = string
  default     = "ap-hongkong-2"
}
