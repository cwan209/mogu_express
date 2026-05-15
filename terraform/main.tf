provider "tencentcloud" {
  secret_id  = var.tencent_secret_id
  secret_key = var.tencent_secret_key
  region     = var.region
  # 国际版账号路由到 intl 子域,SDK 会拼成 <service>.intl.tencentcloudapi.com;
  # 国内版账号留空走默认 tencentcloudapi.com
  domain = var.tencent_intl ? "intl.tencentcloudapi.com" : ""
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# 域名前缀:prod = "shop"、staging = "shop-staging"
locals {
  env_suffix = var.env_name == "prod" ? "" : "-${var.env_name}"
  fqdns = {
    shop  = "shop${local.env_suffix}.${var.root_domain}"
    admin = "admin${local.env_suffix}.${var.root_domain}"
    api   = "api${local.env_suffix}.${var.root_domain}"
  }
  cvm_instance_name = "${var.cvm_instance_name_prefix}-${var.env_name}"
}

# ===== Modules =====

# VPC + subnet — CVM 和 Mongo 共用,内网通信
module "network" {
  source = "./modules/network"

  env_name          = var.env_name
  availability_zone = var.cvm_availability_zone
}

module "cvm" {
  source = "./modules/cvm"

  instance_name              = local.cvm_instance_name
  env_name                   = var.env_name
  availability_zone          = var.cvm_availability_zone
  instance_type              = var.cvm_instance_type
  system_disk_size           = var.cvm_system_disk_size
  internet_max_bandwidth_out = var.cvm_internet_max_bandwidth_out
  ssh_public_key             = var.ssh_public_key

  vpc_id    = module.network.vpc_id
  subnet_id = module.network.subnet_id
}

module "cos" {
  source = "./modules/cos"

  bucket_basename = "${var.cos_bucket_basename}-${var.env_name}"
  region          = var.cos_region
}

module "cloudflare_dns" {
  source = "./modules/cloudflare_dns"

  zone_id          = var.cloudflare_zone_id
  root_domain      = var.root_domain
  vps_ip           = module.cvm.public_ip
  shop_sub_domain  = "shop${local.env_suffix}"
  admin_sub_domain = "admin${local.env_suffix}"
  api_sub_domain   = "api${local.env_suffix}"
}

# 注:Mongo 改为在 CVM 上 docker 自管(见 deploy/docker-compose.production.yml),
# 数据持久化到独立 CBS 数据盘(cvm 模块输出 mongo_data_disk_id)。
# 备份走 scripts/backup-mongo.sh,每日 dump → COS,30/60/365 天 lifecycle。
