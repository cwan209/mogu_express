// services/cart.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function getCart() {
  if (config.useMock) return mock.getCart();
  return callFunction('getCart');
}

function upsertCart({ productId, quantity }) {
  if (config.useMock) return mock.upsertCart({ productId, quantity });
  return callFunction('upsertCart', { productId, quantity });
}

function clearCart() {
  if (config.useMock) return mock.clearCart();
  return callFunction('clearCart');
}

module.exports = { getCart, upsertCart, clearCart };
