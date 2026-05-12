# DNSPod:shop / admin / api 三条 A 记录
#
# 前置:域名已在 DNSPod 接入(nameserver 改 f1g1ns1.dnspod.net / f1g1ns2.dnspod.net)

resource "tencentcloud_dnspod_record" "shop" {
  domain      = var.root_domain
  record_type = "A"
  record_line = "默认"
  value       = var.vps_ip
  sub_domain  = var.shop_sub_domain
  ttl         = 600
}

resource "tencentcloud_dnspod_record" "admin" {
  domain      = var.root_domain
  record_type = "A"
  record_line = "默认"
  value       = var.vps_ip
  sub_domain  = var.admin_sub_domain
  ttl         = 600
}

resource "tencentcloud_dnspod_record" "api" {
  domain      = var.root_domain
  record_type = "A"
  record_line = "默认"
  value       = var.vps_ip
  sub_domain  = var.api_sub_domain
  ttl         = 600
}
