output "instance_id" {
  value = tencentcloud_instance.main.id
}

output "public_ip" {
  value = tencentcloud_instance.main.public_ip
}

output "private_ip" {
  value = tencentcloud_instance.main.private_ip
}

output "security_group_id" {
  value = tencentcloud_security_group.cvm.id
}

output "mongo_data_disk_id" {
  description = "Mongo 数据盘 ID(挂在 CVM 的 /dev/vdb,需要 deploy 脚本格式化挂 /data)"
  value       = tencentcloud_cbs_storage.mongo_data.id
}
