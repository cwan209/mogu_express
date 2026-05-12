variable "root_domain" {
  description = "根域名(已在 DNSPod 接入)"
  type        = string
}

variable "vps_ip" {
  description = "VPS 公网 IP,从 lighthouse module output 传入"
  type        = string
}
