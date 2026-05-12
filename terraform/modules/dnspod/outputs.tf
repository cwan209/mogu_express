output "fqdns" {
  value = {
    shop  = "shop.${var.root_domain}"
    admin = "admin.${var.root_domain}"
    api   = "api.${var.root_domain}"
  }
}
