// utils/date.js - 日期/倒计时工具

/**
 * 计算 target 与 now 的剩余时间。返回 { expired, days, hours, minutes, seconds, totalMs }
 */
function remaining(target, now) {
  const t = typeof target === 'string' ? new Date(target).getTime() : target;
  const n = now == null ? Date.now() : (typeof now === 'string' ? new Date(now).getTime() : now);
  const diff = t - n;
  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  const sec = Math.floor(diff / 1000);
  return {
    expired: false,
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
    totalMs: diff,
  };
}

/**
 * "MM-DD HH:mm" 简短格式
 */
function short(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = { remaining, short };
