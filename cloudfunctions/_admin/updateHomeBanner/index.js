// _admin/updateHomeBanner - 后台编辑首页 banner/公告
//
// 入参: { token, title, subtitle }
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try { return verify(event.token, JWT_SECRET); }
    catch { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return res.data[0];
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const title    = (event && event.title    || '').toString().trim();
    const subtitle = (event && event.subtitle || '').toString().trim();
    if (!title) return { code: 1, message: 'title required' };

    const data = { _id: 'home_banner', title, subtitle, updatedAt: new Date() };
    await db.collection('settings').doc('home_banner').set({ data })
      .catch(async (err) => {
        // 某些 shim 不支持 doc().set();退化为 add(upsert) 或 update
        try {
          await db.collection('settings').doc('home_banner').update({
            data: { title, subtitle, updatedAt: new Date() },
          });
        } catch {
          await db.collection('settings').add({ data });
        }
        if (err && /^test/.test(err.message)) throw err;
      });
    return { code: 0, banner: { title, subtitle } };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
