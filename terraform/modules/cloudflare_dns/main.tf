# Cloudflare DNS — shop / admin / api 三条 A 记录
#
# 重要:proxied = false(灰云 / DNS only)
#   - Caddy 在 VPS 自签 Let's Encrypt 证书需要 80 端口直达 VPS
#   - Cloudflare 代理(橙云)会拦 ACME 挑战 + 终止 TLS,跟 Caddy 自签冲突
#   - 我们只用 Cloudflare 做 DNS 解析,流量不走 CF 节点

resource "cloudflare_record" "shop" {
  zone_id = var.zone_id
  name    = var.shop_sub_domain
  content = var.vps_ip
  type    = "A"
  ttl     = 300
  proxied = false
  comment = "Managed by Terraform — mogu-express"
}

resource "cloudflare_record" "admin" {
  zone_id = var.zone_id
  name    = var.admin_sub_domain
  content = var.vps_ip
  type    = "A"
  ttl     = 300
  proxied = false
  comment = "Managed by Terraform — mogu-express"
}

resource "cloudflare_record" "api" {
  zone_id = var.zone_id
  name    = var.api_sub_domain
  content = var.vps_ip
  type    = "A"
  ttl     = 300
  proxied = false
  comment = "Managed by Terraform — mogu-express"
}
