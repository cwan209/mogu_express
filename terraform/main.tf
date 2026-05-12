provider "tencentcloud" {
  secret_id  = var.tencent_secret_id
  secret_key = var.tencent_secret_key
  region     = var.region
}

# ===== Modules =====

module "lighthouse" {
  source = "./modules/lighthouse"

  instance_name  = var.lighthouse_instance_name
  bundle_id      = var.lighthouse_bundle_id
  blueprint_id   = var.lighthouse_blueprint_id
  region         = var.region
  ssh_public_key = var.ssh_public_key
  shop_domain    = "shop.${var.root_domain}"
  admin_domain   = "admin.${var.root_domain}"
  api_domain     = "api.${var.root_domain}"
}

module "cos" {
  source = "./modules/cos"

  bucket_basename = var.cos_bucket_basename
  region          = var.cos_region
}

module "dnspod" {
  source = "./modules/dnspod"

  root_domain = var.root_domain
  vps_ip      = module.lighthouse.public_ip
}
