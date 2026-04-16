#!/usr/bin/env node
/*
 * scripts/check-syntax.js
 *   对所有 JS 文件做 require/parse,捕获语法错误。
 *   不依赖 wx-server-sdk(用 Module hook 给一个空 stub),
 *   也不依赖 exceljs 等(允许 MODULE_NOT_FOUND 视为通过)。
 *
 *   覆盖:
 *     - cloudfunctions/(每个云函数)
 *     - miniprogram/{pages,components,services,utils,model,config}/**.js
 *
 *   exit 0 = 全通过
 *   exit 1 = 有真语法/逻辑错
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');

// Stub 掉 wx-server-sdk 和 'exceljs' 等运行时才有的依赖,这里仅查语法
const STUBS = new Set(['wx-server-sdk', 'exceljs']);
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, p, ...rest) {
  if (STUBS.has(r)) return path.resolve(__dirname, 'check-syntax.stub.js');
  return orig.call(this, r, p, ...rest);
};

// 写一个空 stub 文件(仅本进程内引用)
const STUB = path.resolve(__dirname, 'check-syntax.stub.js');
if (!fs.existsSync(STUB)) {
  fs.writeFileSync(STUB, 'module.exports = new Proxy({}, { get: () => () => ({}) });\n');
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'miniprogram_npm') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name.endsWith('.js')) yield full;
  }
}

const targets = [
  'cloudfunctions',
  'miniprogram/pages',
  'miniprogram/components',
  'miniprogram/services',
  'miniprogram/utils',
  'miniprogram/model',
  'miniprogram/config',
  'miniprogram/app.js',
];

let ok = 0;
let fail = 0;
const failures = [];

for (const t of targets) {
  const full = path.join(root, t);
  if (!fs.existsSync(full)) continue;
  const files = fs.statSync(full).isDirectory() ? [...walk(full)] : [full];
  for (const f of files) {
    try {
      // 不真 require,用 Module 的 _compile 校验语法即可
      const src = fs.readFileSync(f, 'utf8');
      // 用 vm.compileFunction(底层和 require 一致)只跑语法 phase
      new Function(src);
      ok++;
    } catch (err) {
      // new Function 对 ES module syntax 报错(import/export),
      // 但小程序和云函数都 CJS,不应有 ESM。
      fail++;
      failures.push({ file: path.relative(root, f), err: err.message.split('\n')[0] });
    }
  }
}

console.log(`✓ ${ok} files OK,  ${fail} failed`);
if (failures.length) {
  console.log();
  for (const { file, err } of failures) console.log(`  ✗ ${file}`);
  console.log();
  for (const { file, err } of failures) console.log(`${file}\n  ${err}\n`);
  process.exit(1);
}
