// utils/cloud.js - 云函数调用统一封装
// 三种路径:
//   config.useMock       → 直接抛错(service 层应在此之前走 mock)
//   config.useHttpBackend → wx.request 打本地 Docker
//   否则                  → wx.cloud.callFunction
const config = require('../config/index.js');

function httpCallFunction(name, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.httpApiBase}/cloud/${name}`,
      method: 'POST',
      data: data || {},
      header: {
        'content-type': 'application/json',
        'x-mock-openid': getApp()?.globalData?.openid || 'mp_test_user',
      },
      timeout: 20000,
      success: (res) => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const r = res.data;
        if (r && r.code && r.code !== 0) {
          const err = new Error(r.message || 'cloud function error');
          err.code = r.code;
          reject(err);
          return;
        }
        resolve(r);
      },
      fail: (err) => reject(err),
    });
  });
}

function wxCloudCallFunction(name, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      return reject(new Error('wx.cloud 不可用(测试号或未 init)'));
    }
    wx.cloud
      .callFunction({ name, data: data || {} })
      .then((res) => {
        const result = res && res.result;
        if (result && result.code && result.code !== 0) {
          const err = new Error(result.message || 'cloud function error');
          err.code = result.code;
          return reject(err);
        }
        resolve(result);
      })
      .catch((err) => reject(err));
  });
}

function callFunction(name, data = {}) {
  if (config.useHttpBackend) return httpCallFunction(name, data);
  return wxCloudCallFunction(name, data);
}

module.exports = { callFunction };
