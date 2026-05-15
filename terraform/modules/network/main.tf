# VPC + subnet — CVM 和 TencentDB MongoDB 都进同一个 VPC,内网通信
#
# 设计:
# - 单 VPC,单 subnet(单可用区,简化)
# - CIDR 10.20.0.0/16 / subnet 10.20.1.0/24
# - mongo 安全组允许来自整个 subnet CIDR 的 27017,这样 CVM 无论拿哪个内网 IP 都能通

resource "tencentcloud_vpc" "main" {
  name       = "mogu-${var.env_name}-vpc"
  cidr_block = var.vpc_cidr

  tags = {
    app      = "mogu-express"
    mogu_env = var.env_name
  }
}

resource "tencentcloud_subnet" "main" {
  name              = "mogu-${var.env_name}-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = var.subnet_cidr
  availability_zone = var.availability_zone

  tags = {
    app      = "mogu-express"
    mogu_env = var.env_name
  }
}
