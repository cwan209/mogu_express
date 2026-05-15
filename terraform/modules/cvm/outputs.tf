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
