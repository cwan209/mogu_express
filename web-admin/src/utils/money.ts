// CNY 金额工具 — 与 miniprogram/utils/money.js 保持一致
// 全链路内部存"分"(整数)

export const CURRENCY = 'CNY';
export const SYMBOL = '¥';

export const fromCents = (c: number) => {
  if (typeof c !== 'number' || isNaN(c)) return '0.00';
  return (c / 100).toFixed(2);
};
export const formatMoney = (c: number) => SYMBOL + fromCents(c);
// 向后兼容别名(旧代码用的 formatAud,现在返回 ¥)
export const formatAud = formatMoney;
export const toCents = (s: string | number): number | null => {
  const n = Number(s);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
};
