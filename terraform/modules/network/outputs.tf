output "vpc_id" { value = tencentcloud_vpc.main.id }
output "subnet_id" { value = tencentcloud_subnet.main.id }
output "subnet_cidr" { value = tencentcloud_subnet.main.cidr_block }
