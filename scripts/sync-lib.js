#!/usr/bin/env node
/*
 * scripts/sync-lib.js
 *   把 cloudfunctions/_lib/ 下的共享代码同步到需要它们的云函数目录
 *
 *   每次修改 _lib/* 后跑一次 `node scripts/sync-lib.js` 再部署
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// ---- 待同步的共享模块 ----
// { src: 单文件源 | 目录, destName: 拷到目标目录下叫什么 }
const LIBS = [
  {
    name: 'jwt',
    src: path.join(root, 'cloudfunctions/_lib/auth/jwt.js'),
    targets: [
      'cloudfunctions/_admin/adminLogin',
      'cloudfunctions/_admin/tuanCRUD',
      'cloudfunctions/_admin/productCRUD',
      'cloudfunctions/_admin/categoryCRUD',
      'cloudfunctions/_admin/listAllOrders',
      'cloudfunctions/_admin/markShipped',
      'cloudfunctions/_admin/markCompleted',
      'cloudfunctions/_admin/orderStats',
      'cloudfunctions/_admin/exportOrders',
      'cloudfunctions/_admin/uploadImage',
    ],
    destName: 'jwt.js',
    kind: 'file',
  },
  {
    name: 'huepay',
    src: path.join(root, 'cloudfunctions/_lib/huepay'),
    targets: [
      'cloudfunctions/createOrder',
      'cloudfunctions/payCallback',
      'cloudfunctions/queryHuepayOrder',
      'cloudfunctions/_dev/simulatePay',
    ],
    destName: 'huepay',
    kind: 'dir',
  },
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

let copied = 0;
for (const lib of LIBS) {
  if (!fs.existsSync(lib.src)) {
    console.error(`[sync-lib] MISSING ${lib.name}:`, lib.src);
    process.exit(1);
  }
  for (const rel of lib.targets) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) {
      console.warn(`[sync-lib] skip missing target ${rel}`);
      continue;
    }
    const dest = path.join(target, lib.destName);
    if (lib.kind === 'file') {
      copyFile(lib.src, dest);
    } else {
      // 先清再拷
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      copyDir(lib.src, dest);
    }
    console.log(`  ✓ ${lib.name} → ${rel}/${lib.destName}`);
    copied++;
  }
}
console.log(`[sync-lib] copied ${copied} entries`);
