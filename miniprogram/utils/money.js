// utils/money.js - AUD 金额工具
// 规则:全链路内部存"分"(整数),显示时除 100 保留两位小数

/**
 * 分 → 显示字符串  e.g. 1999 → "19.99"
 */
function fromCents(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

/**
 * 带货币符号的显示  e.g. 1999 → "$19.99"
 */
function formatAud(cents) {
  return '$' + fromCents(cents);
}

/**
 * 分 → 澳币全称  e.g. 1999 → "A$19.99"
 */
function formatAudLong(cents) {
  return 'A$' + fromCents(cents);
}

/**
 * 元(字符串) → 分(整数).输入非法时返回 null
 */
function toCents(dollarStr) {
  if (dollarStr === '' || dollarStr == null) return null;
  const n = Number(dollarStr);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

module.exports = { fromCents, formatAud, formatAudLong, toCents };
