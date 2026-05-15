output "fqdns" {
  description = "完整域名映射"
  value = {
    shop  = "${var.shop_sub_domain}.${var.root_domain}"
    admin = "${var.admin_sub_domain}.${var.root_domain}"
    api   = "${var.api_sub_domain}.${var.root_domain}"
  }
}

output "record_ids" {
  value = {
    shop  = cloudflare_record.shop.id
    admin = cloudflare_record.admin.id
    api   = cloudflare_record.api.id
  }
}
