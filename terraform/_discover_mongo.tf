# 临时:列出 HK ap-hongkong-2 实际在售的 Mongo 规格
# 用完即删

data "tencentcloud_mongodb_zone_config" "hk2" {
  available_zone = "ap-hongkong-2"
}

output "mongo_specs" {
  description = "HK ap-hongkong-2 在售 Mongo 规格"
  value = [
    for s in data.tencentcloud_mongodb_zone_config.hk2.list : {
      engine  = s.engine_version
      mtype   = s.machine_type
      ctype   = s.cluster_type
      cpu     = s.cpu
      memory  = s.memory
      default = s.default_storage
      min     = s.min_storage
      max     = s.max_storage
    }
  ]
}
