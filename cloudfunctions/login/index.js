// cloudfunctions/login/index.js
// 职责:
//   1. 从 WXContext 拿 openid
//   2. upsert `users` 集合
//   3. 判断是否已完善注册资料、是否是管理员
//   4. 返回 { code: 0, openid, isRegistered, isAdmin, userInfo? }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID, UNIONID, APPID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: 1, message: 'no openid (未登录)' };
  }

  const now = new Date();

  // upsert users
  const userCol = db.collection('users');
  const existing = await userCol.where({ _openid: OPENID }).limit(1).get();

  let userDoc;
  if (existing.data && existing.data.length) {
    userDoc = existing.data[0];
    await userCol.doc(userDoc._id).update({
      data: { updatedAt: now, unionid: UNIONID || userDoc.unionid || null },
    });
  } else {
    const addRes = await userCol.add({
      data: {
        _openid: OPENID,   // 虽然云开发会自动写,但显式存一份便于 where 查
        unionid: UNIONID || null,
        appid: APPID || null,
        name: '',
        phone: '',
        defaultAddressId: null,
        registeredAt: null,     // 完善资料后再填
        createdAt: now,
        updatedAt: now,
      },
    });
    userDoc = {
      _id: addRes._id,
      name: '',
      phone: '',
      registeredAt: null,
    };
  }

  // 判断是否管理员
  let isAdmin = false;
  try {
    const adminRes = await db
      .collection('admins')
      .where({ openid: OPENID })
      .limit(1)
      .get();
    isAdmin = !!(adminRes.data && adminRes.data.length);
  } catch (err) {
    // admins 集合可能尚未创建,忽略
    console.warn('[login] query admins failed (可能集合未建)', err.message);
  }

  return {
    code: 0,
    openid: OPENID,
    isRegistered: !!userDoc.registeredAt,
    isAdmin,
    userInfo: {
      name: userDoc.name || '',
      phone: userDoc.phone || '',
    },
  };
};
