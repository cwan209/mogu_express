// utils/money.js - CNY 金额工具
// 规则:全链路内部存"分"(整数),显示时除 100 保留两位小数

const CURRENCY = 'CNY';
const SYMBOL = '¥';

/**
 * 分 → 显示字符串  e.g. 1999 → "19.99"
 */
function fromCents(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

/**
 * 带货币符号的显示  e.g. 1999 → "¥19.99"
 */
function formatMoney(cents) {
  return SYMBOL + fromCents(cents);
}

/**
 * 元(字符串) → 分(整数).输入非法时返回 null
 */
function toCents(yuanStr) {
  if (yuanStr === '' || yuanStr == null) return null;
  const n = Number(yuanStr);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

// 向后兼容别名 — 老代码的 formatAud/formatAudLong 仍可用,值是 ¥
const formatAud = formatMoney;
const formatAudLong = formatMoney;

module.exports = { CURRENCY, SYMBOL, fromCents, formatMoney, formatAud, formatAudLong, toCents };
