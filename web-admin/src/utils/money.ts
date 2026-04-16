// AUD 金额工具 — 与 miniprogram/utils/money.js 保持一致
export const fromCents = (c: number) => (c / 100).toFixed(2);
export const formatAud = (c: number) => '$' + fromCents(c);
export const toCents = (s: string | number): number | null => {
  const n = Number(s);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
};
