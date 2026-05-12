output "vps_public_ip" {
  description = "VPS 公网 IP,用于 SSH 部署"
  value       = module.lighthouse.public_ip
}

output "vps_instance_id" {
  value = module.lighthouse.instance_id
}

output "fqdns" {
  description = "完整域名"
  value = {
    shop  = "shop.${var.root_domain}"
    admin = "admin.${var.root_domain}"
    api   = "api.${var.root_domain}"
  }
}

output "cos_bucket" {
  description = "COS bucket 名"
  value       = module.cos.bucket_name
}

output "cos_endpoint" {
  description = "COS S3 兼容端点"
  value       = module.cos.endpoint
}

output "cos_public_url_prefix" {
  description = "拼回前端的图片 URL 前缀"
  value       = module.cos.public_url_prefix
}

output "cos_subuser_access_key" {
  description = "COS 子账号 AccessKey(给 backend 用)"
  value       = module.cos.access_key
  sensitive   = true
}

output "cos_subuser_secret_key" {
  description = "COS 子账号 SecretKey(给 backend 用)"
  value       = module.cos.secret_key
  sensitive   = true
}
