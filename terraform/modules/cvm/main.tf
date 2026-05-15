# CVM 实例 — 替代 Lighthouse,可以加入用户 VPC 跟 TencentDB Mongo 内网通信
#
# 网络:
# - 在 var.vpc_id / var.subnet_id 里
# - allocate_public_ip = true,顺便分配公网 IP(按量计费 + 10M 带宽,够用)
# - 安全组开 22/80/443 入站
#
# 镜像:用 data source 拉最新 Ubuntu 22.04 LTS 公共镜像

data "tencentcloud_images" "ubuntu" {
  image_type = ["PUBLIC_IMAGE"]
  os_name    = "Ubuntu Server 22.04 LTS 64bit"
}

# SSH 密钥(CVM 用 tencentcloud_key_pair,不是 lighthouse_key_pair)
resource "tencentcloud_key_pair" "deploy" {
  key_name   = replace(var.instance_name, "-", "_") # 数字字母下划线
  public_key = var.ssh_public_key
  project_id = 0
}

# 安全组 — VPS 入口
resource "tencentcloud_security_group" "cvm" {
  name        = "${var.instance_name}-sg"
  description = "Allow 22/80/443 from anywhere, plus internal subnet"
}

resource "tencentcloud_security_group_rule_set" "cvm" {
  security_group_id = tencentcloud_security_group.cvm.id

  ingress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "TCP"
    port        = "22"
    description = "SSH"
  }
  ingress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "TCP"
    port        = "80"
    description = "HTTP (Caddy ACME + redirect)"
  }
  ingress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "TCP"
    port        = "443"
    description = "HTTPS"
  }
  ingress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "ICMP"
    port        = "ALL"
    description = "ping"
  }

  egress {
    action     = "ACCEPT"
    cidr_block = "0.0.0.0/0"
    protocol   = "ALL"
    port       = "ALL"
  }
}

# 独立数据盘 — mongo 数据持久化,生命周期独立于实例(重建 CVM 时数据保留)
resource "tencentcloud_cbs_storage" "mongo_data" {
  storage_name      = "${var.instance_name}-mongo-data"
  storage_type      = "CLOUD_PREMIUM"
  storage_size      = var.data_disk_size
  availability_zone = var.availability_zone

  tags = {
    app      = "mogu-express"
    mogu_env = var.env_name
    purpose  = "mongo-data"
  }
}

resource "tencentcloud_instance" "main" {
  instance_name     = var.instance_name
  availability_zone = var.availability_zone
  image_id          = data.tencentcloud_images.ubuntu.images[0].image_id
  instance_type     = var.instance_type

  system_disk_type = "CLOUD_PREMIUM"
  system_disk_size = var.system_disk_size

  vpc_id    = var.vpc_id
  subnet_id = var.subnet_id

  key_ids                 = [tencentcloud_key_pair.deploy.id]
  orderly_security_groups = [tencentcloud_security_group.cvm.id]

  # 公网 IP — 按量带宽,初期 10M 够 H5 小流量
  allocate_public_ip         = true
  internet_charge_type       = "TRAFFIC_POSTPAID_BY_HOUR"
  internet_max_bandwidth_out = var.internet_max_bandwidth_out

  hostname = replace(var.instance_name, "_", "-")

  tags = {
    app      = "mogu-express"
    mogu_env = var.env_name
  }

  lifecycle {
    # 改 instance_type 会原地变配,但改 image_id / disk 会重建 — 锁掉
    ignore_changes = [
      image_id,
      system_disk_size,
    ]
  }
}

# 把数据盘挂到 CVM,挂载点 /dev/vdb(系统盘是 /dev/vda),格式化 + 挂到 /data 由 ansible/init 脚本做
resource "tencentcloud_cbs_storage_attachment" "mongo_data" {
  storage_id  = tencentcloud_cbs_storage.mongo_data.id
  instance_id = tencentcloud_instance.main.id
}
