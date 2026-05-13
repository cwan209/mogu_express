output "instance_id" {
  value = tencentcloud_mongodb_instance.main.id
}

output "instance_name" {
  value = tencentcloud_mongodb_instance.main.instance_name
}

output "mongo_host" {
  description = "Mongo 主域名(腾讯云分配)"
  value       = tencentcloud_mongodb_instance.main.vip
}

output "mongo_port" {
  value = tencentcloud_mongodb_instance.main.vport
}

# 完整 URI,可直接塞给应用
# 注:腾讯云开放公网访问后,有独立的公网 IP/端口,需要从控制台手动开启并配 host;
# 这里先返内网 vip:vport;启用公网后再换。
output "mongo_uri" {
  description = "MongoDB connection URI(含 TLS + 副本集 + 鉴权)"
  value = format(
    "mongodb://mongouser:%s@%s:%d/mogu_express?authSource=admin&replicaSet=%s&ssl=true&retryWrites=true",
    random_password.mongo_root.result,
    tencentcloud_mongodb_instance.main.vip,
    tencentcloud_mongodb_instance.main.vport,
    tencentcloud_mongodb_instance.main.id,
  )
  sensitive = true
}

output "mongo_root_password" {
  value     = random_password.mongo_root.result
  sensitive = true
}

output "security_group_id" {
  value = tencentcloud_security_group.mongo.id
}
