variable "env_name" {
  description = "环境名(staging / prod),用于实例命名"
  type        = string
}

variable "vps_public_ip" {
  description = "VPS 公网 IP — 加入 mongo 安全组白名单"
  type        = string
}

variable "region" {
  description = "腾讯云区域"
  type        = string
  default     = "ap-hongkong"
}

variable "availability_zone" {
  description = "可用区(HK 可选 ap-hongkong-2 / ap-hongkong-3)"
  type        = string
  default     = "ap-hongkong-2"
}

variable "memory" {
  description = "内存 GB"
  type        = number
  default     = 2
}

variable "volume" {
  description = "磁盘 GB"
  type        = number
  default     = 25
}

variable "engine_version" {
  description = "MongoDB 引擎版本(腾讯云命名),目前主用 MONGO_70_WT(7.0+WiredTiger)"
  type        = string
  default     = "MONGO_70_WT"
}

variable "machine_type" {
  description = "机型 — HMONGO 系列高 IO 副本集"
  type        = string
  default     = "HMONGO_HMASTER"
}

variable "node_num" {
  description = "副本集节点数(包含主+从+只读)。3 = 经典 HA"
  type        = number
  default     = 3
}
