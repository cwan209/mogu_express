// cloudfunctions/_lib/sms/index.js
// 短信发送 - 默认 stub(打印日志),配置 TENCENT_SMS_* 环境变量后改走真实
//
// 真实模式环境变量:
//   TENCENT_SMS_SECRET_ID
//   TENCENT_SMS_SECRET_KEY
//   TENCENT_SMS_APP_ID            (短信 SdkAppId)
//   TENCENT_SMS_SIGN              (短信签名,如「蘑菇接龙」)
//   TENCENT_SMS_TEMPLATE_OTP      (OTP 模板 ID)
//   TENCENT_SMS_REGION            (默认 ap-guangzhou)
//
// stub 模式时,验证码会同时返回在 sendOtp 响应里(`__devOtp`)便于本地测试

const STUB = process.env.SMS_STUB === '1' || !process.env.TENCENT_SMS_SECRET_ID;

async function sendOtpSms(phone, otp) {
  if (STUB) {
    console.log(`[sms-stub] -> ${phone} OTP=${otp}`);
    return { __stub: true, otp };
  }
  // 真实模式:腾讯云 SMS REST API
  return realSendOtp(phone, otp);
}

async function realSendOtp(phone, otp) {
  // 延迟引入 SDK,避免 stub 模式下也要装包
  const tencentcloud = require('tencentcloud-sdk-nodejs-sms');
  const SmsClient = tencentcloud.sms.v20210111.Client;
  const client = new SmsClient({
    credential: {
      secretId: process.env.TENCENT_SMS_SECRET_ID,
      secretKey: process.env.TENCENT_SMS_SECRET_KEY,
    },
    region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
    profile: {
      httpProfile: { endpoint: 'sms.tencentcloudapi.com' },
    },
  });
  const params = {
    SmsSdkAppId: process.env.TENCENT_SMS_APP_ID,
    SignName: process.env.TENCENT_SMS_SIGN,
    TemplateId: process.env.TENCENT_SMS_TEMPLATE_OTP,
    TemplateParamSet: [String(otp), '5'],   // {1}=验证码,{2}=有效分钟数
    PhoneNumberSet: [phone.startsWith('+') ? phone : `+86${phone}`],
  };
  const res = await client.SendSms(params);
  const status = res.SendStatusSet?.[0];
  if (!status || status.Code !== 'Ok') {
    throw new Error(`SMS send failed: ${status?.Code} ${status?.Message}`);
  }
  return { __stub: false, requestId: res.RequestId };
}

module.exports = { sendOtpSms, isStub: STUB };
