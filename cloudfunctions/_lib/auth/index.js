// cloudfunctions/_lib/auth/index.js
// 共享的 auth 辅助。各云函数若需要,可以在部署前通过构建脚本复制本目录到自己目录下。
// 目前简单起见,在每个需要的云函数里直接 `require('./jwt.js')` 即可(复制本目录过去)。

const jwt = require('./jwt.js');

module.exports = {
  ...jwt,
};
