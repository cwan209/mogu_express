output "bucket_name" {
  value = tencentcloud_cos_bucket.images.bucket
}

output "endpoint" {
  description = "S3 兼容端点 URL"
  value       = "https://cos.${var.region}.myqcloud.com"
}

output "region" {
  value = var.region
}

output "public_url_prefix" {
  description = "拼回前端的 URL 前缀"
  value       = "https://${tencentcloud_cos_bucket.images.bucket}.cos.${var.region}.myqcloud.com"
}

output "access_key" {
  # tencentcloud_cam_access_key.id 是复合形式 "<uin>#<AKID>",拆出后段拿真正的 AK
  value     = split("#", tencentcloud_cam_access_key.cos_writer.id)[1]
  sensitive = true
}

output "secret_key" {
  value     = tencentcloud_cam_access_key.cos_writer.secret_access_key
  sensitive = true
}
