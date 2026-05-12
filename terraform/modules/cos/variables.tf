variable "bucket_basename" {
  description = "COS bucket 名前缀,会拼上 appid 后缀全局唯一"
  type        = string
}

variable "region" {
  type    = string
  default = "ap-hongkong"
}
