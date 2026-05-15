output "instance_id" {
  value = tencentcloud_lighthouse_instance.main.id
}

output "public_ip" {
  value = tencentcloud_lighthouse_instance.main.public_addresses[0]
}

output "ssh_key_name" {
  value = tencentcloud_lighthouse_key_pair.deploy.key_name
}
