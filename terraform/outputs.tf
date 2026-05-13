output "env_name" {
  value = var.env_name
}

output "vps_public_ip" {
  description = "VPS 公网 IP,用于 SSH 部署"
  value       = module.lighthouse.public_ip
}

output "vps_instance_id" {
  value = module.lighthouse.instance_id
}

output "fqdns" {
  description = "完整域名"
  value       = local.fqdns
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

output "mongo_instance_id" {
  description = "TencentDB Mongo 实例 ID,腾讯云控制台快速跳转用"
  value       = module.mongodb.instance_id
}

output "mongo_uri" {
  description = "完整 MongoDB URI(含密码 + TLS + 副本集)— deploy 时塞到 .env"
  value       = module.mongodb.mongo_uri
  sensitive   = true
}

output "mongo_root_password" {
  description = "Mongo 主账号密码,需要 console 登录或恢复时用"
  value       = module.mongodb.mongo_root_password
  sensitive   = true
}
