// config/index.js - 小程序全局配置
// 替换为真实云环境 ID(微信开发者工具 → 云开发 → 环境 ID)

module.exports = {
  // 云开发环境 ID
  cloudEnvId: 'PLACEHOLDER_ENV_ID',

  // 数据后端选择(三选一):
  //   useMock: true           → 所有数据走本地 wx.storage(测试号/演示用)
  //   useHttpBackend: true    → 走 httpApiBase 指向的 Docker 本地后端
  //                              · 开发者工具模拟器:用 'http://localhost:4000'
  //                              · 真机扫码:用 Mac 局域网 IP,如 'http://192.168.20.11:4000'
  //                              · 必须在"详情 → 本地设置"勾选"不校验合法域名..."
  //   两者都 false             → 走微信云开发 cloud.callFunction(需 cloudEnvId,测试号不可)
  useMock: false,
  useHttpBackend: true,
  httpApiBase: 'http://192.168.20.11:4000',   // ← Mac LAN IP, 真机模拟器都通; 模拟器 also OK localhost

  // mock 模式下是否模拟"需要支付"流程(显示付款页 + 模拟支付按钮)
  // true 的话 → mock.createOrder 产出 pending_pay 订单 + payParams.__stub
  //           → 订单确认页点"提交"后跳支付结果页,用户看到"正在支付"+倒计时
  // false   → 订单直接 paid,跳支付结果页显示"下单成功"
  mockRequirePay: true,

  // 环境开关
  isProd: false,

  // 分享默认文案
  shareTitle: '接龙团购｜限时优惠快来接龙',
  shareImage: '', // TODO: 替换为 CDN/云存储封面

  // 业务常量
  currency: 'AUD',

  // 每次分页大小
  pageSize: 20,
};
