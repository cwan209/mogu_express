// 全链路用 整数分(CNY)。前端显示时除 100 保留两位。
export function formatCny(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function formatCnyAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
