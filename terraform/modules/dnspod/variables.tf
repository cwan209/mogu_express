variable "root_domain" {
  description = "根域名(已在 DNSPod 接入)"
  type        = string
}

variable "vps_ip" {
  description = "VPS 公网 IP"
  type        = string
}

# Staging 用 shop-staging / admin-staging / api-staging
# Prod 用 shop / admin / api
variable "shop_sub_domain" { type = string }
variable "admin_sub_domain" { type = string }
variable "api_sub_domain" { type = string }
