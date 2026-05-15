variable "zone_id" {
  description = "Cloudflare zone ID(在域名 overview 页面右下角找)"
  type        = string
}

variable "root_domain" {
  description = "根域名,如 mogu-express.com(zone_id 对应的域名)"
  type        = string
}

variable "vps_ip" {
  description = "VPS 公网 IP"
  type        = string
}

# 三个子域 prefix(staging 时 shop-staging 等)
variable "shop_sub_domain" { type = string }
variable "admin_sub_domain" { type = string }
variable "api_sub_domain" { type = string }
