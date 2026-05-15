# 腾讯云 TencentDB for MongoDB — 副本集,VPC 内网
#
# - 跟 CVM 同 VPC 同 subnet,内网通信(vip 是 VPC 内 IP)
# - 安全组放行整个 subnet CIDR 的 27017 入站
# - TLS 强制开启
# - 主用户密码 Terraform random_password 生成,存 state(state bucket 必须私有)
#
# 文档:https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs/resources/mongodb_instance

# 随机后缀防实例命名撞车
resource "random_id" "name_suffix" {
  byte_length = 2
}

# 主账号密码 — 腾讯云 Mongo 规则:8-32 字符,大写+小写+数字+(可选)特殊;
# special 字符集踩坑率高,索性关掉只用 alnum,够安全(20 字符的 alnum 熵 ~119 bit)
resource "random_password" "mongo_root" {
  length      = 20
  special     = false
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
}

resource "tencentcloud_security_group" "mongo" {
  name        = "mogu-mongo-${var.env_name}-${random_id.name_suffix.hex}-sg"
  description = "Allow mongo 27017 from CVM subnet only"
}

resource "tencentcloud_security_group_rule_set" "mongo" {
  security_group_id = tencentcloud_security_group.mongo.id

  ingress {
    action      = "ACCEPT"
    cidr_block  = var.subnet_cidr
    protocol    = "TCP"
    port        = "27017"
    description = "Allow Mongo from CVM subnet"
  }

  egress {
    action     = "ACCEPT"
    cidr_block = "0.0.0.0/0"
    protocol   = "ALL"
    port       = "ALL"
  }
}

# 主资源
resource "tencentcloud_mongodb_instance" "main" {
  instance_name  = "mogu-mongo-${var.env_name}-${random_id.name_suffix.hex}"
  memory         = var.memory
  volume         = var.volume
  engine_version = var.engine_version
  machine_type   = var.machine_type
  node_num       = var.node_num
  available_zone = var.availability_zone

  vpc_id    = var.vpc_id
  subnet_id = var.subnet_id

  project_id  = 0
  password    = random_password.mongo_root.result
  charge_type = "POSTPAID_BY_HOUR" # 按量计费;改 PREPAID 时记得加回 prepaid_period + auto_renew_flag

  security_groups = [tencentcloud_security_group.mongo.id]

  tags = {
    app      = "mogu-express"
    mogu_env = var.env_name
  }

  lifecycle {
    ignore_changes = [
      charge_type,
    ]
  }
}
