variable "env_name" {
  description = "环境名(staging / prod),用于实例命名"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID — mongo 实例进这个 VPC"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID — mongo 实例进这个 subnet"
  type        = string
}

variable "subnet_cidr" {
  description = "Subnet CIDR — 安全组放行该 CIDR 内任意源访问 27017"
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
  description = "机型 — HIO10G(10Gbps 高 IO,目前唯一非废弃选项)"
  type        = string
  default     = "HIO10G"
}

variable "node_num" {
  description = "副本集节点数(包含主+从+只读)。3 = 经典 HA"
  type        = number
  default     = 3
}
