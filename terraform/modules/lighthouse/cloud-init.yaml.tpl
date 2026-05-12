#cloud-config
# 这个 cloud-init 当前不被 Lighthouse 直接消费(provider 1.81 暂无 user_data 字段)。
# 由 GitHub Actions deploy-app.yml 在首次部署时 scp 到 VPS 并 bash 执行。
#
# 模板变量(Terraform 渲染时替换):
#   git_repo     = ${git_repo}
#   shop_domain  = ${shop_domain}
#   admin_domain = ${admin_domain}
#   api_domain   = ${api_domain}

package_update: true
package_upgrade: false

packages:
  - ca-certificates
  - curl
  - git
  - ufw

runcmd:
  # ufw 防火墙
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow OpenSSH
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable

  # Docker
  - curl -fsSL https://get.docker.com | sh
  - systemctl enable --now docker
  - usermod -aG docker ubuntu || true

  # 时区
  - timedatectl set-timezone Asia/Shanghai

  # 拉仓库
  - mkdir -p /opt
  - git clone ${git_repo} /opt/mogu_express || (cd /opt/mogu_express && git pull)

write_files:
  - path: /etc/motd
    content: |
      mogu_express production VPS
      Shop:  https://${shop_domain}
      Admin: https://${admin_domain}
      API:   https://${api_domain}
      Code:  /opt/mogu_express
      Stack: docker compose -f /opt/mogu_express/deploy/docker-compose.production.yml ...

final_message: "mogu_express VPS bootstrap done. ETA: $UPTIME seconds"
