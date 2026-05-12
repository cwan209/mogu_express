// sendOtp - 发送手机号验证码
//
// 限流:同一手机号 60s 内只能发一次,每号每日最多 10 次
// OTP 存储:otp_codes 集合,TTL 5 分钟(用 expiresAt 字段 + 应用层判断;Mongo TTL 索引可选)
// 安全:不返回 OTP(stub 模式下例外,便于本地测试)
//
// 入参:{ phone: string }   (11位中国大陆手机号)
// 出参:{ code: 0, expiresIn: 300, __devOtp?: '123456' }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { sendOtpSms, isStub } = require('./sms');

const RESEND_COOLDOWN_SEC = 60;
const DAILY_LIMIT = 10;
const OTP_TTL_SEC = 300;
const PHONE_RE = /^1[3-9]\d{9}$/;

exports.main = async (event) => {
  const { phone } = event || {};
  if (!phone || !PHONE_RE.test(phone)) {
    return { code: 1, message: '手机号格式错误' };
  }

  const col = db.collection('otp_codes');
  const now = new Date();

  // 1. 检查 60s 冷却
  const recent = await col.where({
    phone,
    createdAt: _.gte(new Date(now.getTime() - RESEND_COOLDOWN_SEC * 1000)),
  }).count();
  if (recent.total > 0) {
    return { code: 2, message: `请稍后再试(${RESEND_COOLDOWN_SEC}s 内只能发送一次)` };
  }

  // 2. 检查每日次数
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await col.where({
    phone,
    createdAt: _.gte(startOfDay),
  }).count();
  if (todayCount.total >= DAILY_LIMIT) {
    return { code: 3, message: '今日验证码次数已用尽' };
  }

  // 3. 生成 6 位 OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  // 4. 写入数据库
  await col.add({
    data: {
      phone,
      otp,
      verified: false,
      attempts: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + OTP_TTL_SEC * 1000),
    },
  });

  // 5. 调短信网关
  let sendResult;
  try {
    sendResult = await sendOtpSms(phone, otp);
  } catch (err) {
    console.error('[sendOtp] sms error', err);
    return { code: 4, message: '短信发送失败: ' + (err.message || 'unknown') };
  }

  const ret = { code: 0, expiresIn: OTP_TTL_SEC };
  if (isStub) ret.__devOtp = otp;  // 本地开发便利,真实模式下不返
  void sendResult;
  return ret;
};
