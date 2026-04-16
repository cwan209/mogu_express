// services/product.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function getProductDetail(productId) {
  if (config.useMock) return mock.getProductDetail(productId);
  return callFunction('getProductDetail', { productId });
}

module.exports = { getProductDetail };
