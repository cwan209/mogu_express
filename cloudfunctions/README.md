# 云函数目录

## 结构

- `login/` — 顾客/管理员登录,拿 openid + 判断是否已注册/是否管理员
- `_lib/auth/` — 共享的 JWT/密码哈希工具(源码,被各管理员云函数复制)
- `_admin/` — 管理员专用云函数
  - `adminLogin/` — Web 后台用户名密码登录,签 JWT

## 部署

微信开发者工具 → 云开发 → 云函数:
- 每个子目录右键"上传并部署:云端安装依赖",等待 `wx-server-sdk` 装好

## 共享 `_lib/auth`

云开发上传云函数时**只打包该子目录**,无法跨目录 require。因此我们在 `_lib/auth/` 保持源文件,
在每个需要 auth 的管理员云函数部署前,**把 `_lib/auth/jwt.js` 复制到目标云函数目录**。

手动复制:
```bash
cp cloudfunctions/_lib/auth/jwt.js cloudfunctions/_admin/adminLogin/jwt.js
```

后续 M1+ 多个管理员云函数时,建议在根目录加 `scripts/sync-lib.js`,自动同步到所有 `_admin/*` 子目录。

## 环境变量

- `JWT_SECRET` — 在云开发控制台云函数"环境变量"里设置(`adminLogin` 及未来任何签/验 JWT 的云函数)

## 创建初始管理员

```bash
# 在本地 node 里生成密码哈希
cd cloudfunctions/_lib/auth
node -e "console.log(require('./jwt.js').hashPassword('你的密码'))"
```

把输出的 `pbkdf2$...` 字符串,在云开发控制台手动 insert `admins` 集合:

```json
{
  "openid": "<团长的 openid,从 login 云函数日志拿到>",
  "username": "admin",
  "passwordHash": "pbkdf2$100000$....",
  "role": "owner",
  "createdAt": {"$date": "2026-04-15T00:00:00Z"}
}
```
