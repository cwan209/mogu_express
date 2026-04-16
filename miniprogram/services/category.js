// services/category.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function listCategories() {
  if (config.useMock) return mock.listCategories();
  return callFunction('listCategories').then((r) => (r && r.items) || []);
}

module.exports = { listCategories };
