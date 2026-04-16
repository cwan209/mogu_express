// app.js
const config = require('./config/index.js');
const userService = require('./services/user.js');

App({
  globalData: {
    openid: null,
    userInfo: null,
    isRegistered: false,
    isAdmin: false,
    loginPromise: null,
    checkoutItems: [],      // 购物车→订单确认 传参(避开 URL 冒号问题)
  },

  onLaunch() {
    // 只有在使用真实云开发时才 init(测试号没有云开发权限,init 会报错)
    const needCloud = !config.useMock && !config.useHttpBackend;
    if (needCloud) {
      if (!wx.cloud) {
        console.error('[app] 基础库过低,或未开通云开发');
      } else if (!config.cloudEnvId || config.cloudEnvId.startsWith('PLACEHOLDER')) {
        console.warn('[app] cloudEnvId 未配置,云开发不可用');
      } else {
        wx.cloud.init({ env: config.cloudEnvId, traceUser: true });
      }
    } else {
      console.info('[app] 当前模式:', config.useMock ? 'Mock' : 'HTTP backend');
    }

    // 启动即登录;mock 和 http 模式都 OK
    this.ensureLogin().catch((err) => {
      console.warn('[app] ensureLogin failed', err.message);
    });
  },

  ensureLogin() {
    if (this.globalData.openid) {
      return Promise.resolve({
        openid: this.globalData.openid,
        isRegistered: this.globalData.isRegistered,
        isAdmin: this.globalData.isAdmin,
      });
    }
    if (this.globalData.loginPromise) {
      return this.globalData.loginPromise;
    }
    // 统一走 service 层,内部按 useMock/useHttpBackend/cloud 切换
    this.globalData.loginPromise = userService
      .login()
      .then((res) => {
        this.globalData.openid = res.openid || null;
        this.globalData.isRegistered = !!res.isRegistered;
        this.globalData.isAdmin = !!res.isAdmin;
        if (res.userInfo) this.globalData.userInfo = res.userInfo;
        return res;
      })
      .catch((err) => {
        console.error('[app] login failed', err);
        this.globalData.loginPromise = null;
        throw err;
      });
    return this.globalData.loginPromise;
  },
});
