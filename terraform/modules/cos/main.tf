# 腾讯云 COS:bucket + CAM 子账号(最小权限) + AccessKey
#
# 注:COS bucket 名全局唯一,腾讯云要求格式 `<basename>-<appid>`(appid 是数字)。
# 用 data source 拿到当前账号 appid 自动拼。

data "tencentcloud_user_info" "current" {}

resource "random_id" "suffix" {
  byte_length = 2
}

locals {
  # bucket 名:<basename>-<random>-<appid>
  bucket_full_name = "${var.bucket_basename}-${random_id.suffix.hex}-${data.tencentcloud_user_info.current.app_id}"
}

resource "tencentcloud_cos_bucket" "images" {
  bucket = local.bucket_full_name
  acl    = "public-read" # 商品图公开访问

  cors_rules {
    allowed_origins = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }

  # 临时文件 7 天清
  lifecycle_rules {
    filter_prefix = "tmp/"
    expiration {
      days = 7
    }
  }

  # MongoDB 备份 — 转储路径 backup/YYYY-MM-DD-HHMM.gz
  # 30d 转低频(半价),60d 转归档(再降),365d 删除
  lifecycle_rules {
    filter_prefix = "backup/"
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 60
      storage_class = "ARCHIVE"
    }
    expiration {
      days = 365
    }
  }
}

# 子账号(仅有该 bucket 的 PutObject/GetObject/DeleteObject 权限)
resource "tencentcloud_cam_user" "cos_writer" {
  name          = "${var.bucket_basename}-writer"
  remark        = "Service account for mogu-express to upload images"
  console_login = false
  use_api       = true
}

# 自定义策略 — 仅限本 bucket
resource "tencentcloud_cam_policy" "cos_writer" {
  name        = "${var.bucket_basename}-writer-policy"
  description = "Limit to single COS bucket"

  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        # cos:* 限定到本 bucket — 已是最小权限的"资源维度",动作维度全开省得漏。
        # coscli/aws-sdk 在不同操作前会做各种 HEAD / GetBucketLocation precheck,
        # 一个个动作枚举既容易漏(403),也徒增维护成本。
        action = ["name/cos:*"]
        resource = [
          "qcs::cos:${var.region}:uid/${data.tencentcloud_user_info.current.app_id}:${tencentcloud_cos_bucket.images.bucket}/*",
          "qcs::cos:${var.region}:uid/${data.tencentcloud_user_info.current.app_id}:${tencentcloud_cos_bucket.images.bucket}",
        ]
      },
    ]
  })
}

resource "tencentcloud_cam_user_policy_attachment" "cos_writer" {
  user_name = tencentcloud_cam_user.cos_writer.name
  policy_id = tencentcloud_cam_policy.cos_writer.id
}

# 生成 AK/SK
resource "tencentcloud_cam_access_key" "cos_writer" {
  target_uin = tencentcloud_cam_user.cos_writer.uin
  status     = "Active"
}
