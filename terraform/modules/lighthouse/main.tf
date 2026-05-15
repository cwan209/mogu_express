# 腾讯云轻量服务器 — HK 单实例
#
# Lighthouse 在 Terraform provider 里参数比 CVM 少。套餐 bundle_id 一旦改会强制重建,
# 用 lifecycle.ignore_changes 防止误操作。

# SSH 密钥(Lighthouse 专用,跟 CVM 的 tencentcloud_key_pair 是不同资源)
# 注:Lighthouse key_name 上限 25 字符,只允许数字/字母/下划线;
# instance_name 形如 "mogu-express-staging"(20) → replace dash → "mogu_express_staging" 正好 20
resource "tencentcloud_lighthouse_key_pair" "deploy" {
  key_name   = replace(var.instance_name, "-", "_")
  public_key = var.ssh_public_key
}

# 防火墙模板 — 开放 22 / 80 / 443
resource "tencentcloud_lighthouse_firewall_template" "main" {
  template_name = "${var.instance_name}-fw"

  template_rules {
    protocol                  = "TCP"
    port                      = "22"
    cidr_block                = "0.0.0.0/0"
    action                    = "ACCEPT"
    firewall_rule_description = "SSH"
  }
  template_rules {
    protocol                  = "TCP"
    port                      = "80"
    cidr_block                = "0.0.0.0/0"
    action                    = "ACCEPT"
    firewall_rule_description = "HTTP (Caddy ACME challenge + redirect)"
  }
  template_rules {
    protocol                  = "TCP"
    port                      = "443"
    cidr_block                = "0.0.0.0/0"
    action                    = "ACCEPT"
    firewall_rule_description = "HTTPS"
  }
  template_rules {
    protocol                  = "ICMP"
    port                      = "ALL"
    cidr_block                = "0.0.0.0/0"
    action                    = "ACCEPT"
    firewall_rule_description = "ping"
  }
}

resource "tencentcloud_lighthouse_instance" "main" {
  instance_name = var.instance_name
  bundle_id     = var.bundle_id
  blueprint_id  = var.blueprint_id
  period        = 1
  renew_flag    = "NOTIFY_AND_AUTO_RENEW"

  # 直接绑防火墙模板,不用单独的 _apply 资源(provider 已废弃)
  firewall_template_id = tencentcloud_lighthouse_firewall_template.main.id

  # 套餐升降级会 force replace,生产期实例 ID 必须稳定 → 锁定不改
  lifecycle {
    ignore_changes = [
      bundle_id,
      blueprint_id,
      period,
    ]
  }
}

# 把 SSH key 绑到实例(Lighthouse 专用 attachment 资源)
resource "tencentcloud_lighthouse_key_pair_attachment" "deploy" {
  instance_id = tencentcloud_lighthouse_instance.main.id
  key_id      = tencentcloud_lighthouse_key_pair.deploy.id
}

# 注:cloud-init.yaml.tpl 暂未用 — Lighthouse provider 不支持 user_data,
# 首次环境初始化(Docker、Caddy 等)走 GH Actions deploy-app.yml workflow。
