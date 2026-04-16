// services/tuan.js - 团相关服务
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function listTuans() {
  if (config.useMock) return mock.listTuans();
  return callFunction('listTuans').then((r) => (r && r.items) || []);
}

function getTuanDetail(tuanId) {
  if (config.useMock) return mock.getTuanDetail(tuanId);
  return callFunction('getTuanDetail', { tuanId });
}

module.exports = { listTuans, getTuanDetail };
