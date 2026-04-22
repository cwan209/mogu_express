// services/cart.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function getCart() {
  if (config.useMock) return mock.getCart();
  return callFunction('getCart');
}

function upsertCart({ tuanItemId, productId, quantity }) {
  // 向后兼容:老调用可能传 productId(历史上 _id 即 productId)
  const id = tuanItemId || productId;
  if (config.useMock) return mock.upsertCart({ tuanItemId: id, productId: id, quantity });
  return callFunction('upsertCart', { tuanItemId: id, quantity });
}

function clearCart() {
  if (config.useMock) return mock.clearCart();
  return callFunction('clearCart');
}

module.exports = { getCart, upsertCart, clearCart };
