# 腾讯云 TencentDB for MongoDB — 副本集
#
# - 走公网 + IP 白名单(Lighthouse 跟 TencentDB 不在同 VPC)
# - TLS 强制开启
# - 主用户密码 Terraform random_password 生成,存 state(state bucket 必须私有)
#
# 文档:https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest/docs/resources/mongodb_instance

# 随机后缀防实例命名撞车
resource "random_id" "name_suffix" {
  byte_length = 2
}

# 主账号密码
resource "random_password" "mongo_root" {
  length      = 24
  special     = true
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
  min_special = 1
  # 腾讯云密码不允许这些字符
  override_special = "!@#$%^&*()_+-="
}

# 安全组:仅允许 VPS public IP 27017 入站
resource "tencentcloud_security_group" "mongo" {
  name        = "mogu-mongo-${var.env_name}-${random_id.name_suffix.hex}-sg"
  description = "Allow mongo 27017 from VPS only"
}

resource "tencentcloud_security_group_lite_rule" "mongo_ingress" {
  security_group_id = tencentcloud_security_group.mongo.id
  ingress = [
    "ACCEPT#${var.vps_public_ip}/32#27017#TCP",
  ]
  egress = [
    "ACCEPT#0.0.0.0/0#ALL#ALL",
  ]
}

# 主资源
resource "tencentcloud_mongodb_instance" "main" {
  instance_name   = "mogu-mongo-${var.env_name}-${random_id.name_suffix.hex}"
  memory          = var.memory
  volume          = var.volume
  engine_version  = var.engine_version
  machine_type    = var.machine_type
  node_num        = var.node_num
  available_zone  = var.availability_zone
  project_id      = 0
  password        = random_password.mongo_root.result
  charge_type     = "POSTPAID_BY_HOUR" # 按量计费,需要时启停灵活;包年包月可改 PREPAID
  prepaid_period  = 1
  auto_renew_flag = 0

  security_groups = [tencentcloud_security_group.mongo.id]

  tags = {
    project = "mogu-express"
    env     = var.env_name
  }

  lifecycle {
    # 防止重启 / 升级触发实例重建
    ignore_changes = [
      charge_type,
      prepaid_period,
    ]
  }
}
