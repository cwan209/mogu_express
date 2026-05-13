provider "tencentcloud" {
  secret_id  = var.tencent_secret_id
  secret_key = var.tencent_secret_key
  region     = var.region
}

# 域名前缀:prod = "shop"、staging = "shop-staging"
locals {
  env_suffix = var.env_name == "prod" ? "" : "-${var.env_name}"
  fqdns = {
    shop  = "shop${local.env_suffix}.${var.root_domain}"
    admin = "admin${local.env_suffix}.${var.root_domain}"
    api   = "api${local.env_suffix}.${var.root_domain}"
  }
  instance_name = "${var.lighthouse_instance_name_prefix}-${var.env_name}"
}

# ===== Modules =====

module "lighthouse" {
  source = "./modules/lighthouse"

  instance_name  = local.instance_name
  bundle_id      = var.lighthouse_bundle_id
  blueprint_id   = var.lighthouse_blueprint_id
  region         = var.region
  ssh_public_key = var.ssh_public_key
  shop_domain    = local.fqdns.shop
  admin_domain   = local.fqdns.admin
  api_domain     = local.fqdns.api
}

module "cos" {
  source = "./modules/cos"

  bucket_basename = "${var.cos_bucket_basename}-${var.env_name}"
  region          = var.cos_region
}

module "dnspod" {
  source = "./modules/dnspod"

  root_domain      = var.root_domain
  vps_ip           = module.lighthouse.public_ip
  shop_sub_domain  = "shop${local.env_suffix}"
  admin_sub_domain = "admin${local.env_suffix}"
  api_sub_domain   = "api${local.env_suffix}"
}

module "mongodb" {
  source = "./modules/mongodb"

  env_name          = var.env_name
  vps_public_ip     = module.lighthouse.public_ip
  region            = var.region
  availability_zone = var.mongo_availability_zone
  memory            = var.mongo_memory
  volume            = var.mongo_volume
  node_num          = var.mongo_node_num
}
