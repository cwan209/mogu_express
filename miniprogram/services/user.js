// services/user.js - 用户相关
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

// 登录 + upsert users,返回 {openid, isRegistered, isAdmin, userInfo?}
function login() {
  if (config.useMock) {
    // M1/M2 mock:从本地资料推导 isRegistered
    return mock.getProfile().then((p) => ({
      openid: 'mock_openid_local_dev',
      isRegistered: !!p.registeredAt,
      isAdmin: false,
      userInfo: { name: p.name || '', phone: p.phone || '' },
    }));
  }
  return callFunction('login');
}

function getProfile() {
  if (config.useMock) return mock.getProfile();
  return callFunction('getProfile');
}

// 完善姓名/电话
function saveProfile({ name, phone }) {
  if (config.useMock) return mock.saveProfile({ name, phone });
  return callFunction('registerProfile', { name, phone });
}

module.exports = { login, getProfile, saveProfile };
