// services/banner.js - 首页 banner / 公告
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function getHomeBanner() {
  if (config.useMock) return mock.getHomeBanner();
  return callFunction('getHomeBanner').then((r) => r.banner);
}

module.exports = { getHomeBanner };
