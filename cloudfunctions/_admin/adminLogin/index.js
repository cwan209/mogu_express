// cloudfunctions/_admin/adminLogin/index.js
// Web 后台用户名 + 密码登录,签 JWT。
//
// 预置步骤(M0 首次使用):
//   1. 云开发控制台创建集合 `admins`
//   2. 在本地 node REPL 用 `require('./jwt.js').hashPassword('你的密码')` 生成密码哈希
//   3. 手动 insert admins 一条:
//        { openid: '<你的 openid>', username: 'admin', passwordHash: 'pbkdf2$...', role: 'owner', createdAt: new Date() }
//   4. 部署本云函数
//
// JWT secret 配置:
//   在云函数"环境变量"里设置 JWT_SECRET(云开发控制台 → 云函数 → adminLogin → 环境变量)
//   未配置时会 fallback 到 DEV_SECRET(仅开发,上线必须配)

const cloud = require('wx-server-sdk');
const { sign, verifyPassword } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DEV_SECRET = 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

exports.main = async (event) => {
  const { username, password } = event || {};
  if (!username || !password) {
    return { code: 1, message: 'username/password required' };
  }

  const res = await db
    .collection('admins')
    .where({ username: String(username) })
    .limit(1)
    .get();

  const admin = res.data && res.data[0];
  if (!admin) {
    // 不透露存在性
    return { code: 2, message: 'invalid credentials' };
  }

  if (!verifyPassword(password, admin.passwordHash)) {
    return { code: 2, message: 'invalid credentials' };
  }

  const secret = process.env.JWT_SECRET || DEV_SECRET;
  const token = sign(
    {
      sub: admin._id,
      username: admin.username,
      role: admin.role || 'owner',
      openid: admin.openid || null,
    },
    secret,
    7 * 24 * 3600
  );

  return {
    code: 0,
    token,
    admin: {
      id: admin._id,
      username: admin.username,
      role: admin.role || 'owner',
    },
  };
};
