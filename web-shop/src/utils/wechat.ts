// WeChat OAuth helper — 检测 UA + redirect 到微信授权页 + 处理 code 回跳
//
// 入口策略:
//   1. App.tsx mount 时调 ensureWechatOAuth()
//   2. 若已有 JWT(localStorage),跳过
//   3. 若 URL 已有 ?code=,后续 wxLogin 流程在 store 里处理
//   4. 若在微信内 + 无 JWT + 无 code → redirect 到微信授权页
//   5. 若不在微信内 + 无 JWT → 跳转 /qr-fallback 页(显示二维码)

export const isWechatBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
};

const APP_ID = import.meta.env.VITE_WECHAT_APP_ID as string | undefined;

function genState(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 跳转到微信授权页(snsapi_userinfo,首次弹一次授权框)
 *
 * snsapi_userinfo 比 snsapi_base 多拿:nickname / headimgurl / sex / country /
 * province / city / language。首次弹"该网站想获取以下信息"对话框,用户点同意
 * 后微信记住此 appid 的授权,之后该用户进来不再弹。
 *
 * 注:2022+ 微信对新用户做 nickname/avatar 脱敏(返"微信用户"+默认头像),
 * 老用户可能仍是真昵称/头像。地区信息(country/province/city)未脱敏。
 */
export function redirectToWechatAuth(returnPath: string): void {
  if (!APP_ID) {
    console.warn('[wechat] VITE_WECHAT_APP_ID 未配,跳过 OAuth');
    return;
  }
  // 把 returnPath 编码到 state 里,回跳时还原
  const state = genState();
  sessionStorage.setItem('wx_oauth_state', state);
  sessionStorage.setItem('wx_oauth_return', returnPath);

  // redirect_uri 必须 URL encode,且必须是 网页授权域名 同源
  const redirectUri = encodeURIComponent(window.location.origin + '/oauth-callback');
  const url =
    `https://open.weixin.qq.com/connect/oauth2/authorize` +
    `?appid=${APP_ID}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=snsapi_userinfo` +
    `&state=${state}` +
    `#wechat_redirect`;
  window.location.href = url;
}

/** 从 URL 拿 code(微信回跳后调) */
export function extractCodeFromUrl(): { code: string; state: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;
  return { code, state };
}

/** 验证 state(防 CSRF) */
export function verifyState(state: string): boolean {
  return sessionStorage.getItem('wx_oauth_state') === state;
}

export function consumeReturnPath(): string {
  const path = sessionStorage.getItem('wx_oauth_return') || '/';
  sessionStorage.removeItem('wx_oauth_state');
  sessionStorage.removeItem('wx_oauth_return');
  return path;
}
