// services/product.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

// productId 参数名保留 — 实际传入的是 tuanItemId(历史上小程序把 _id 当 productId 用)。
// 底层把它当 tuanItemId 走(后端两种都兼容)。
function getProductDetail(idOrTuanItemId) {
  if (config.useMock) return mock.getProductDetail(idOrTuanItemId);
  return callFunction('getProductDetail', { tuanItemId: idOrTuanItemId });
}

module.exports = { getProductDetail };
