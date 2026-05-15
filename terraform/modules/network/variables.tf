variable "env_name" { type = string }

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "subnet_cidr" {
  type    = string
  default = "10.20.1.0/24"
}

variable "availability_zone" {
  description = "subnet 所属可用区(跟 mongo 一致,简化跨 AZ)"
  type        = string
}
