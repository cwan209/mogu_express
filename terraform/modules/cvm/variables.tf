variable "instance_name" { type = string }
variable "env_name" { type = string }
variable "availability_zone" { type = string }
variable "instance_type" {
  description = "CVM 机型,如 S5.MEDIUM2(2C2G) / S5.MEDIUM4(2C4G)"
  type        = string
}
variable "system_disk_size" {
  type    = number
  default = 50
}
variable "internet_max_bandwidth_out" {
  type    = number
  default = 10
}
variable "ssh_public_key" { type = string }
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
