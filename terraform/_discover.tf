# 临时:列出 HK 区域可用 Lighthouse 套餐,确认 staging/prod 应使用的 bundle_id
# 用完即删 — `git rm terraform/_discover.tf`
#
# 用法:
#   terraform plan -var-file=environments/staging.tfvars
#   (refresh 阶段会读取数据源,plan 末尾会显示 discover_bundles 输出)

data "tencentcloud_lighthouse_bundle" "all" {
}

data "tencentcloud_lighthouse_blueprints" "ubuntu" {
  filters {
    name   = "platform-type"
    values = ["LINUX_UNIX"]
  }
  filters {
    name   = "blueprint-type"
    values = ["PURE_OS"]
  }
}

output "discover_bundles" {
  description = "HK 可用的 Lighthouse 套餐列表(临时)"
  value = [
    for b in data.tencentcloud_lighthouse_bundle.all.bundle_set : {
      id     = b.bundle_id
      cpu    = b.cpu
      memory = b.memory
      disk   = b.system_disk_size
      sys    = b.bundle_sales_state
      type   = b.bundle_type
    }
  ]
}

output "discover_blueprints" {
  description = "HK 可用的 Linux 纯系统镜像(临时,挑 Ubuntu 22.04)"
  value = [
    for b in data.tencentcloud_lighthouse_blueprints.ubuntu.blueprint_set : {
      id      = b.blueprint_id
      title   = b.display_title
      os      = b.os_name
      version = b.display_version
      state   = b.blueprint_state
    }
  ]
}
