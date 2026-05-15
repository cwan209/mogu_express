output "env_name" {
  value = var.env_name
}

output "vps_public_ip" {
  description = "CVM 公网 IP,用于 SSH 部署"
  value       = module.cvm.public_ip
}

output "vps_private_ip" {
  description = "CVM 内网 IP(VPC 内,与 Mongo 通信用)"
  value       = module.cvm.private_ip
}

output "vps_instance_id" {
  value = module.cvm.instance_id
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "fqdns" {
  description = "完整域名"
  value       = module.cloudflare_dns.fqdns
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

output "mongo_data_disk_id" {
  description = "Mongo 数据盘 ID(挂在 CVM,docker mongo 数据卷)"
  value       = module.cvm.mongo_data_disk_id
}
