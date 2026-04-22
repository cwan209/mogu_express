// utils/addressValidate.js
// 中国收货地址校验。返回第一个错误 { field, message },全通返回 null。

// 省 / 直辖市 / 自治区 / 特别行政区(34 个,按 GB/T 2260)
const CN_PROVINCES = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南',
  '四川', '贵州', '云南', '陕西', '甘肃',
  '青海', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '香港', '澳门',
];

function norm(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// 中国手机号:1[3-9]xxx xxxx xxxx(去空格/连字符后 11 位)
// 允许 +86 前缀
function isValidCnMobile(s) {
  const digits = String(s).replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (/^1[3-9]\d{9}$/.test(digits)) return true;       // 11 位手机
  if (/^861[3-9]\d{9}$/.test(digits)) return true;     // 带 86
  return false;
}

// 姓名:1-20 字符,至少含一个汉字或字母,不能纯数字/纯符号
function isValidName(s, min = 1, max = 20) {
  if (s.length < min || s.length > max) return false;
  if (/^\d+$/.test(s)) return false;
  if (!/[\p{L}\u4e00-\u9fff]/u.test(s)) return false;
  return true;
}

// 详细地址:3-60 字符,至少含一个汉字或字母
function isValidDetail(s, min = 3, max = 60) {
  if (s.length < min || s.length > max) return false;
  if (!/[\p{L}\u4e00-\u9fff]/u.test(s)) return false;
  return true;
}

// 邮编:6 位数字(中国邮政编码)
function isValidPostcode(s) {
  return /^\d{6}$/.test(s);
}

/**
 * 校验整个表单
 * 字段:recipient / phone / province(原 state)/ city / district(原 suburb)/ detail(原 line1)/ line2 / postcode
 *
 * 为向下兼容老字段名(line1/suburb/state),这里同时读两套,前端 UI 新字段优先。
 */
function validate(form) {
  const recipient = norm(form.recipient);
  if (!recipient) return { field: 'recipient', message: '请输入收件人姓名' };
  if (!isValidName(recipient, 1, 20)) {
    return { field: 'recipient', message: '姓名 1-20 字,不能纯数字' };
  }

  const phone = norm(form.phone);
  if (!phone) return { field: 'phone', message: '请输入手机号' };
  if (!isValidCnMobile(phone)) {
    return { field: 'phone', message: '请输入 11 位中国大陆手机号' };
  }

  // 省 — 兼容字段名:state 或 province
  const province = norm(form.province || form.state);
  if (!province) return { field: 'state', message: '请选择省/市/自治区' };
  if (!CN_PROVINCES.includes(province)) {
    return { field: 'state', message: '省份不在合法列表中' };
  }

  // 市 — 完全选填(表单无独立字段,用户把"市/区"都写在 suburb 字段里)
  const city = norm(form.city);
  if (city && (city.length < 2 || city.length > 20)) {
    return { field: 'city', message: '市名 2-20 字' };
  }

  // 区/县 — 兼容字段名:district 或 suburb
  const district = norm(form.district || form.suburb);
  if (!district) return { field: 'suburb', message: '请输入区/县' };
  if (district.length < 2 || district.length > 20) {
    return { field: 'suburb', message: '区/县 2-20 字' };
  }

  // 详细地址 — 兼容字段名:detail 或 line1
  const detail = norm(form.detail || form.line1);
  if (!detail) return { field: 'line1', message: '请输入详细地址' };
  if (!isValidDetail(detail, 3, 60)) {
    return { field: 'line1', message: '详细地址 3-60 字(街道+门牌号)' };
  }

  const line2 = norm(form.line2);
  if (line2.length > 30) return { field: 'line2', message: '门牌/单元最多 30 字' };

  const postcode = norm(form.postcode);
  // 邮编在中国通常可选(平台可以按省自动填),但后端数据需要,就必填
  if (!postcode) return { field: 'postcode', message: '请输入邮编' };
  if (!isValidPostcode(postcode)) {
    return { field: 'postcode', message: '邮编必须是 6 位数字' };
  }

  return null;
}

// 规整化:trim、province 去前后空格
function normalize(form) {
  return {
    ...form,
    recipient: norm(form.recipient),
    phone: norm(form.phone),
    line1: norm(form.detail || form.line1),          // 兼容
    line2: norm(form.line2),
    suburb: norm(form.district || form.suburb),      // 兼容
    state: norm(form.province || form.state),        // 兼容
    city: norm(form.city),
    postcode: norm(form.postcode),
  };
}

module.exports = {
  CN_PROVINCES,
  validate,
  normalize,
  isValidCnMobile,
  isValidPostcode,
};
