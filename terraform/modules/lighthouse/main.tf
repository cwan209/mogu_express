# 腾讯云轻量服务器 — HK 单实例
#
# Lighthouse 在 Terraform provider 里参数比 CVM 少。套餐 bundle_id 一旦改会强制重建,
# 用 lifecycle.ignore_changes 防止误操作。

# SSH 密钥(导入用户提供的公钥)
resource "tencentcloud_key_pair" "deploy" {
  key_name   = "${var.instance_name}-deploy"
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

# cloud-init 文件渲染
locals {
  user_data = templatefile("${path.module}/cloud-init.yaml.tpl", {
    git_repo     = var.git_repo
    shop_domain  = var.shop_domain
    admin_domain = var.admin_domain
    api_domain   = var.api_domain
  })
}

resource "tencentcloud_lighthouse_instance" "main" {
  instance_name = var.instance_name
  bundle_id     = var.bundle_id
  blueprint_id  = var.blueprint_id
  period        = 1
  renew_flag    = "NOTIFY_AND_AUTO_RENEW"

  login_configuration {
    auto_generate_password = "NO"
    key_ids                = [tencentcloud_key_pair.deploy.id]
  }

  containers {
    container_name  = "mogu-init"
    container_image = "alpine:3.19"
    command         = "sh"
    publish_ports {
      host_port      = 0
      container_port = 0
      ip             = "0.0.0.0"
      protocol       = "tcp"
    }
  }

  # 套餐升降级会 force replace,生产期实例 ID 必须稳定 → 锁定不改
  lifecycle {
    ignore_changes = [
      bundle_id,
      blueprint_id,
      period,
    ]
  }
}

# 绑定防火墙模板到实例
resource "tencentcloud_lighthouse_firewall_template_apply" "main" {
  template_id = tencentcloud_lighthouse_firewall_template.main.id
  apply_lighthouse {
    instance_id = tencentcloud_lighthouse_instance.main.id
  }
}

# 把 user_data 通过 cloudbase 自定义脚本注入(Lighthouse 暂不直接支持 user_data,
# 这里改用首次 SSH provisioner;production 推荐方案是手动跑或用 Ansible)
#
# 注:Lighthouse provider 截至 1.81 还不支持 user_data 字段。
# 实际生产中,cloud-init 改为通过 GH Actions deploy-app.yml 首次执行 init 脚本。
# 这里保留 cloud-init.yaml.tpl 文件作为 reference,GHA workflow 会 scp + bash 执行。
