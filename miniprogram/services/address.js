// services/address.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function listAddresses() {
  if (config.useMock) return mock.listAddresses();
  return callFunction('listAddresses').then((r) => (r && r.items) || []);
}

function upsertAddress(address) {
  if (config.useMock) return mock.upsertAddress(address);
  return callFunction('upsertAddress', { address });
}

function deleteAddress(id) {
  if (config.useMock) return mock.deleteAddress(id);
  return callFunction('deleteAddress', { id });
}

module.exports = { listAddresses, upsertAddress, deleteAddress };
