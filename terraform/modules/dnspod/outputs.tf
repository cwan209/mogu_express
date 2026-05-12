output "fqdns" {
  value = {
    shop  = "${var.shop_sub_domain}.${var.root_domain}"
    admin = "${var.admin_sub_domain}.${var.root_domain}"
    api   = "${var.api_sub_domain}.${var.root_domain}"
  }
}
