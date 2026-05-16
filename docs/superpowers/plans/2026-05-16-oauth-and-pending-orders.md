# WeChat OAuth + 待付订单(尾款)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现微信公众号 OAuth 静默登录(替代/补充 OTP),以及团长结算运费 → 用户在商城内看到待付订单红点 → 一键支付的完整闭环。

**Architecture:**
- OAuth:用 WeChat 公众号"网页授权" `snsapi_base` 拿 openid → 后端签 JWT(沿用 verifyOtp 同款 payload)。Staging 用微信公众平台测试号(免认证,5 分钟拿 AppID/Secret),Prod 用海外认证服务号(等甲方申请)。
- 待付订单:订单 doc 加 `shippingFee` 子文档(amount + payStatus + outTradeNo)。Admin 调 `setShippingFee` 写入,用户 H5 在首页/订单列表显示红点 + 待付 banner,点击进 `PayShipping` 页调起 HuePay。HuePay 回调按 `outTradeNo` 前缀路由(`TRADE` 主订单 / `SHIP` 尾款)。
- 不引入测试框架(本仓库没有),每个 task 用 manual verification + curl/staging E2E 验证。

**Tech Stack:** Node.js (Express cloud function shim) / React + Vite (web-shop / web-admin) / Zustand (前端 state) / antd-mobile (web-shop UI) / antd (web-admin UI) / mongodb-driver / axios。

**对应决策:** `docs/decisions/2026-05-16-auth-and-notifications.md`

**前置(用户操作)**:
1. 注册微信公众平台测试号 https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login
2. 配置"网页授权获取用户基本信息"→ 域名填 `shop-staging.moguexpress.com`(不含 https)
3. 拿到 `appID`(staging)+ `appsecret`
4. 微信扫测试号二维码关注(开发者本人当 fan,免 100 上限烦恼)

---

## Phase 1: OAuth 静默登录

### Task 1: wxLogin 云函数 — OAuth code → JWT

**Files:**
- Create: `cloudfunctions/wxLogin/index.js`
- Create: `cloudfunctions/wxLogin/package.json`
- Create: `cloudfunctions/wxLogin/jwt.js`(从 verifyOtp/jwt.js 复制,避免跨函数 require)
- Reference: `cloudfunctions/verifyOtp/index.js`(JWT 签发 + user upsert 逻辑参考)

- [ ] **Step 1: 创建 package.json**

```bash
mkdir -p cloudfunctions/wxLogin
```

`cloudfunctions/wxLogin/package.json`:
```json
{
  "name": "wxLogin",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

- [ ] **Step 2: 复制 jwt.js**

```bash
cp cloudfunctions/verifyOtp/jwt.js cloudfunctions/wxLogin/jwt.js
```

- [ ] **Step 3: 写 index.js**

`cloudfunctions/wxLogin/index.js`:
```js
// wxLogin — 公众号 OAuth code → openid → JWT
//
// 流程:
//   1. 前端从公众号 OAuth redirect 拿到 code
//   2. 调 https://api.weixin.qq.com/sns/oauth2/access_token 用 code 换 openid
//   3. upsert users 表(以 _openid 为主键)
//   4. 签发同 verifyOtp 格式的 JWT
//
// 入参:{ code }
// 出参:{ code: 0, token, openid, isRegistered, user: { name, phone } }
//
// Env:
//   WECHAT_APP_ID, WECHAT_APP_SECRET — 公众号 / 测试号凭证
//   JWT_SECRET — 同 verifyOtp 共用

const https = require('https');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { sign } = require('./jwt');

const JWT_TTL_SEC = 30 * 24 * 3600; // 30 天

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('invalid JSON from wechat: ' + data));
          }
        });
      })
      .on('error', reject);
  });
}

exports.main = async (event) => {
  const { code } = event || {};
  if (!code) return { code: 1, message: 'code required' };

  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  const jwtSecret = process.env.JWT_SECRET;
  if (!appId || !appSecret) return { code: 500, message: 'WECHAT_APP_ID/SECRET not set' };
  if (!jwtSecret) return { code: 500, message: 'JWT_SECRET not set' };

  // 1. 用 code 换 openid
  const url =
    `https://api.weixin.qq.com/sns/oauth2/access_token` +
    `?appid=${appId}` +
    `&secret=${appSecret}` +
    `&code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  let res;
  try {
    res = await httpsGet(url);
  } catch (err) {
    console.error('[wxLogin] wechat api network failure', err);
    return { code: 2, message: 'wechat api unreachable' };
  }

  if (res.errcode) {
    // 常见 40029=invalid code, 40163=code 已被使用
    console.warn('[wxLogin] wechat returned error', res);
    return { code: 3, message: `wechat error: ${res.errmsg} (${res.errcode})` };
  }

  const openid = res.openid;
  const unionid = res.unionid || null;
  if (!openid) return { code: 4, message: 'wechat returned no openid' };

  // 2. upsert user
  const now = new Date();
  const userCol = db.collection('users');
  const existing = await userCol.where({ _openid: openid }).limit(1).get();

  let isRegistered = false;
  let userInfo = { name: null, phone: null };
  if (existing.data && existing.data.length) {
    const u = existing.data[0];
    isRegistered = Boolean(u.name);
    userInfo = { name: u.name || null, phone: u.phone || null };
    await userCol.doc(u._id).update({
      data: {
        unionid: unionid || u.unionid || null,
        lastLoginAt: now,
        updatedAt: now,
      },
    });
  } else {
    await userCol.add({
      data: {
        _openid: openid,
        unionid,
        registeredAt: null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  }

  // 3. 签 JWT(payload 跟 verifyOtp 格式一致,phone 可能 null)
  const token = sign({ openid, phone: userInfo.phone, role: 'customer' }, jwtSecret, JWT_TTL_SEC);

  return {
    code: 0,
    token,
    openid,
    isRegistered,
    user: userInfo,
  };
};
```

- [ ] **Step 4: 手动测试云函数能 load**

```bash
cd /Users/lukewang/WeChatProjects/mogu_express
node -e "const fn = require('./cloudfunctions/wxLogin'); console.log(typeof fn.main);"
```
Expected: `function`

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/wxLogin/
git commit -m "feat(wxLogin): 新增 OAuth code → openid → JWT 云函数

入参 {code},调微信 sns/oauth2/access_token 换 openid,upsert
users 表,签发跟 verifyOtp 同格式 JWT (phone 可能 null,首次 OAuth
用户没填手机号)。

复用:
- jwt.js 从 verifyOtp 复制(避免跨函数 require)
- users._openid 主键,wx openid 直接当字符串存,跟 PHONE_<sha256>
  并存不冲突

下一步:前端在微信内 redirect → 拿到 code → 调本函数。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 前端 wechat utility — UA 检测 + OAuth redirect

**Files:**
- Create: `web-shop/src/utils/wechat.ts`
- Reference: `web-shop/src/api/client.ts`(看现有 axios 配置)

- [ ] **Step 1: 写 wechat.ts**

`web-shop/src/utils/wechat.ts`:
```ts
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

/** 跳转到微信授权页(snsapi_base,无弹窗静默) */
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
    `&scope=snsapi_base` +
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
```

- [ ] **Step 2: 手动验证 module 能 import**

```bash
cd web-shop && npx tsc --noEmit src/utils/wechat.ts 2>&1 | head
```
Expected: 无输出(或仅 "import.meta" 相关 warning,可忽略)

- [ ] **Step 3: Commit**

```bash
git add web-shop/src/utils/wechat.ts
git commit -m "feat(web-shop): wechat OAuth helper

UA 检测 + redirect 微信授权页 (snsapi_base 静默 scope) + 处理 code
回跳。state 用 sessionStorage 防 CSRF + 记录用户原本想去哪个页面。

跟现有 store/api 解耦,纯 utility,Phase 1 下个 task 集成进 App.tsx。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 前端 API 客户端 — wxLogin caller

**Files:**
- Modify: `web-shop/src/api/auth.ts`(在末尾加 wxLogin 函数)
- Reference: `web-shop/src/api/auth.ts`(verifyOtp 的现有写法)

- [ ] **Step 1: 看现有 api/auth.ts 找 verifyOtp 模式**

```bash
cat web-shop/src/api/auth.ts
```

- [ ] **Step 2: 加 wxLogin 函数**

在 `web-shop/src/api/auth.ts` 末尾追加(具体语法跟 verifyOtp 一致,假设走 client.post('/cloud/wxLogin')):

```ts
export interface WxLoginResult {
  token: string;
  openid: string;
  isRegistered: boolean;
  user: { name: string | null; phone: string | null };
}

export async function wxLogin(code: string): Promise<WxLoginResult> {
  const r = await client.post<any>('/cloud/wxLogin', { code });
  if (r.code !== 0) throw new Error(r.message || 'wxLogin failed');
  return { token: r.token, openid: r.openid, isRegistered: r.isRegistered, user: r.user };
}
```

> 如果现有 `client.post` 签名不同,按现有 verifyOtp 同款风格写。读现有代码 follow pattern。

- [ ] **Step 3: tsc check**

```bash
cd web-shop && npx tsc --noEmit 2>&1 | grep -v 'TS6133\|TS6196' | head
```
Expected: 无 error

- [ ] **Step 4: Commit**

```bash
git add web-shop/src/api/auth.ts
git commit -m "feat(web-shop): api 加 wxLogin caller

复用 verifyOtp 同款 HTTP 流程,只是 endpoint 改 /cloud/wxLogin
入参 {code} 出参跟 verifyOtp 等价。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: OAuth callback 页 + App.tsx bootstrap

**Files:**
- Create: `web-shop/src/pages/OauthCallback.tsx`
- Create: `web-shop/src/pages/QrFallback.tsx`
- Modify: `web-shop/src/App.tsx`(加 routes + bootstrap 逻辑)
- Reference: `web-shop/src/pages/Login.tsx`(setAuth 写法)

- [ ] **Step 1: 写 OauthCallback.tsx**

`web-shop/src/pages/OauthCallback.tsx`:
```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toast } from 'antd-mobile';
import { wxLogin } from '../api/auth';
import { extractCodeFromUrl, verifyState, consumeReturnPath } from '../utils/wechat';
import { useAuthStore } from '../store/auth';

export default function OauthCallback() {
  const nav = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    (async () => {
      const params = extractCodeFromUrl();
      if (!params) {
        Toast.show({ icon: 'fail', content: '微信授权失败:未拿到 code' });
        nav('/', { replace: true });
        return;
      }
      if (!verifyState(params.state)) {
        Toast.show({ icon: 'fail', content: '微信授权失败:state 不匹配' });
        nav('/', { replace: true });
        return;
      }
      try {
        const r = await wxLogin(params.code);
        setAuth(r.token, r.user, r.isRegistered);
        const returnPath = consumeReturnPath();
        // 清掉 URL 上的 code 和 state,避免泄露
        window.history.replaceState({}, '', returnPath);
        nav(returnPath, { replace: true });
      } catch (e: any) {
        Toast.show({ icon: 'fail', content: '登录失败:' + (e.message || '未知错误') });
        nav('/', { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p>登录中...</p>
    </div>
  );
}
```

- [ ] **Step 2: 写 QrFallback.tsx**

`web-shop/src/pages/QrFallback.tsx`:
```tsx
import { NavBar } from 'antd-mobile';

export default function QrFallback() {
  return (
    <>
      <NavBar back={null}>请在微信中打开</NavBar>
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, marginBottom: 20 }}>
          🐾 MoguExpress 仅支持在微信内使用
        </p>
        <p style={{ marginBottom: 30 }}>
          请用微信扫描下方二维码,或长按识别 → 关注公众号 → 点击底部菜单"商城"
        </p>
        {/* TODO: 公众号下来后换成真实二维码图;现在用占位 */}
        <div
          style={{
            width: 200,
            height: 200,
            background: '#eee',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
          }}
        >
          [公众号二维码占位]
        </div>
        <p style={{ marginTop: 30, color: '#888', fontSize: 12 }}>
          开发期:如果你是开发者直接在浏览器测试,请走 /login 走 OTP 流程。
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 3: 改 App.tsx 加 routes + OAuth bootstrap**

读 `web-shop/src/App.tsx` 找到 `<Routes>` 块和 Protected wrapper。在 `<Routes>` 内加两条:

```tsx
<Route path="/oauth-callback" element={<OauthCallback />} />
<Route path="/qr-fallback" element={<QrFallback />} />
```

在 App 函数最顶部(或 useEffect)加 bootstrap:

```tsx
import { isWechatBrowser, redirectToWechatAuth } from './utils/wechat';
import { useAuthStore } from './store/auth';
// ...

function App() {
  const token = useAuthStore((s) => s.token);
  const loc = useLocation();

  useEffect(() => {
    // 已经在 oauth-callback / qr-fallback / login 页 → 不重复跳
    const skipPaths = ['/oauth-callback', '/qr-fallback', '/login'];
    if (skipPaths.includes(loc.pathname)) return;
    // 有 JWT → 跳过
    if (token) return;
    // URL 已带 code(防误进 callback)→ 跳过
    if (window.location.search.includes('code=')) return;

    if (isWechatBrowser()) {
      // 在微信里 + 没登录 → 静默 OAuth
      redirectToWechatAuth(loc.pathname + loc.search);
    } else {
      // 非微信 + 没登录 → 显示二维码 fallback(/login 仍可用作 dev 入口)
      // dev 模式下不强制跳,让用户能去 /login 走 OTP
      // 这里不主动跳 qr-fallback,而是各 Protected 页面跳 login,这部分逻辑不动
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, token]);

  // ... 其余 routes 不变
}
```

> 关键:`Protected` 包装现有保持不动,**它会把未登录用户跳 /login**。OAuth bootstrap 只在微信里"先发制人"跳到微信授权,让登录无感。微信外用户仍走原 /login 流程(开发期方便)。

- [ ] **Step 4: tsc check**

```bash
cd web-shop && npx tsc --noEmit 2>&1 | grep -v 'TS6133\|TS6196' | head
```
Expected: 无 error

- [ ] **Step 5: Commit**

```bash
git add web-shop/src/pages/OauthCallback.tsx web-shop/src/pages/QrFallback.tsx web-shop/src/App.tsx
git commit -m "feat(web-shop): OAuth callback 页 + App.tsx bootstrap

在微信内自动 redirect 到微信授权页,回跳后 /oauth-callback 处理:
- 验 state (防 CSRF)
- 调 wxLogin 换 JWT
- 入 auth store
- 跳回原页面 (returnPath via sessionStorage)
- 清掉 URL 上的 ?code & ?state

非微信入口走 /qr-fallback 显示二维码(图后续替换)。

dev 模式 /login 仍保留 OTP 入口。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 配置 OAuth env (staging .env + deploy workflow)

**Files:**
- Modify: `deploy/.env.staging`(本地,不进 git)
- Modify: `deploy/docker-compose.production.yml`(给 api service 注入 WECHAT_APP_ID/SECRET env)
- Modify: `.github/workflows/deploy-app.yml`(把 VITE_WECHAT_APP_ID 注入前端 build)

- [ ] **Step 1: 改 deploy/docker-compose.production.yml**

在 api service 的 `environment:` 段加:

```yaml
      WECHAT_APP_ID: ${WECHAT_APP_ID:-}
      WECHAT_APP_SECRET: ${WECHAT_APP_SECRET:-}
```

- [ ] **Step 2: 改 .github/workflows/deploy-app.yml — vite build 时注入前端 VITE_WECHAT_APP_ID**

找到 `Install + build web-shop` step,在 `env:` 下加:

```yaml
          VITE_WECHAT_APP_ID: ${{ vars.WECHAT_APP_ID_STAGING }}
```

> 用 Repository **variable** 不是 secret —— AppID 是公开的(微信回跳 URL 里就带),不敏感;AppSecret 才是 secret。

- [ ] **Step 3: 用户操作 — 配 GH secrets + vars**

```bash
# AppSecret 是 secret
gh secret set WECHAT_APP_SECRET_STAGING --body '<测试号的 appsecret>'

# AppID 可以 variable
gh variable set WECHAT_APP_ID_STAGING --body '<测试号的 appid>'
```

然后改 deploy/.env.staging 加两行:

```
WECHAT_APP_ID=<测试号的 appid>
WECHAT_APP_SECRET=<测试号的 appsecret>
```

重新 base64 + 上传 APP_ENV_STAGING:

```bash
gh secret set APP_ENV_STAGING < <(base64 -i deploy/.env.staging)
```

- [ ] **Step 4: Commit(只 commit 公共配置,不含 secret)**

```bash
git add deploy/docker-compose.production.yml .github/workflows/deploy-app.yml
git commit -m "ci(wechat): 注入 WECHAT_APP_ID/SECRET 到 staging

- docker-compose: api service env 加 WECHAT_APP_ID/SECRET 占位
- deploy-app workflow: vite build 时给 web-shop 注 VITE_WECHAT_APP_ID
  (用 Repository variable,非 secret —— AppID 公开)
- AppSecret 走 APP_ENV_STAGING base64 注入(用户自行 gh secret set)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Phase 1 E2E 验证

- [ ] **Step 1: push + 等 deploy 完成**

```bash
git push
gh run watch --workflow=deploy-app.yml
```

- [ ] **Step 2: 用微信扫 staging 二维码进商城**

手机微信 → 我 → 扫一扫 → 扫 `shop-staging.moguexpress.com` 的二维码(用 https://qr-code-generator.com 生成一个)。

期望:
- 灰屏一闪(OAuth redirect)
- 回到首页,已登录(右上角"我的"可点)
- 网络面板可看到 `/oauth-callback?code=...` → 调 `/cloud/wxLogin` → JWT 写 localStorage

- [ ] **Step 3: 看 api log 确认 wxLogin 成功**

```bash
ssh -i ~/.ssh/mogu_deploy ubuntu@$VPS 'sudo docker logs mogu_api --tail 50 | grep -i wxlogin'
```

期望:无 ERROR,有 wxLogin 调用记录(或至少没 wechat api 报错)。

- [ ] **Step 4: 查 mongo users 表确认 OAuth 用户创建**

```bash
ssh -i ~/.ssh/mogu_deploy ubuntu@$VPS 'sudo docker exec mogu_mongo mongosh --quiet --eval "
  db.getSiblingDB(\"mogu_express\").users.find({}, {_openid:1, phone:1, name:1, unionid:1}).limit(5).pretty()
"'
```

期望:看到新增一条 `_openid: 'o...'`(纯 WeChat openid,不带 `PHONE_` 前缀)的记录。

- [ ] **Step 5: 浏览器(非微信)打开 staging shop**

期望:不会自动跳 OAuth(没有微信 UA),走原 /login OTP 流程(dev 兼容)。

- [ ] **Step 6: Commit 标记 Phase 1 完成**

```bash
# 改 docs/staging-readiness.md 加一条 "Phase 1 OAuth 测试号验证通过"
# (其实没 checklist 项,可以加到 § 1 末尾)
git commit -am "docs(staging): Phase 1 OAuth 静默登录 staging 验证通过"
git push
```

---

## Phase 2: 待付订单流(运费尾款)

### Task 7: order 数据模型变化(无 schema change,但加文档约定)

**Files:**
- Modify: `cloudfunctions/createOrder/index.js`(加注释说明 shippingFee 字段;不改逻辑)

> MongoDB 是 schemaless,新字段直接加,无需 migration。

- [ ] **Step 1: 在 createOrder/index.js 文件头注释里加字段说明**

在文件头注释区追加:

```js
// 订单 schema(部分):
//   shippingFee?: {            // 尾款,setShippingFee 时填,初始没有此字段
//     amount: Number,           // 分
//     outTradeNo: 'SHIP<...>',
//     payStatus: 'pending' | 'paid' | 'failed',
//     setAt: Date,
//     paidAt: Date | null,
//   }
```

- [ ] **Step 2: Commit**

```bash
git add cloudfunctions/createOrder/index.js
git commit -m "docs(order): 注释加 shippingFee 字段约定 (尾款)

mongo schemaless,无需 migration。新订单初始无 shippingFee,
setShippingFee 后才有。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: setShippingFee 云函数(admin)

**Files:**
- Create: `cloudfunctions/_admin/setShippingFee/index.js`
- Create: `cloudfunctions/_admin/setShippingFee/package.json`
- Reference: 既有 `cloudfunctions/_admin/*`(找一个看 admin auth 模式)

- [ ] **Step 1: 看现有 admin 云函数怎么做权限校验**

```bash
ls cloudfunctions/_admin/
cat cloudfunctions/_admin/$(ls cloudfunctions/_admin/ | head -1)/index.js | head -30
```

- [ ] **Step 2: 写 package.json**

`cloudfunctions/_admin/setShippingFee/package.json`:
```json
{
  "name": "_admin_setShippingFee",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "latest" }
}
```

- [ ] **Step 3: 写 index.js**

`cloudfunctions/_admin/setShippingFee/index.js`:
```js
// _admin/setShippingFee — 团长 admin 设订单运费
//
// 入参: { orderId, amount }   amount in cents (¥35 = 3500)
// 出参: { code: 0, order } 或错误码
//
// 权限: 复用现有 _admin/* 鉴权(JWT role: 'admin')
//
// 行为:
//   1. 查 order,确认存在 + 未付主单状态合理(允许 paid / shipped 等)
//   2. 写入 order.shippingFee = { amount, outTradeNo: SHIP<rand>, payStatus: 'pending', setAt: now }
//   3. 不调任何外部通知 — 用户在商城内通过红点 / 弹窗看到
//
// 注:重复调用会**覆盖**之前的 shippingFee(便于团长改运费)。
//   若 shippingFee.payStatus === 'paid',拒绝改动。

const crypto = require('crypto');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  // 注:_admin/* 由 server.js 路由层做 role 校验,这里可信任 OPENID 是 admin
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const { orderId, amount } = event || {};
  if (!orderId) return { code: 1, message: 'orderId required' };
  if (typeof amount !== 'number' || amount < 0 || amount > 1_000_000) {
    return { code: 2, message: 'amount must be 0..1000000 (cents)' };
  }

  const col = db.collection('orders');
  const doc = await col.doc(orderId).get().catch(() => null);
  if (!doc || !doc.data) return { code: 3, message: 'order not found' };
  const order = doc.data;

  if (order.shippingFee && order.shippingFee.payStatus === 'paid') {
    return { code: 4, message: '该订单运费已付,不可修改' };
  }

  const outTradeNo = 'SHIP' + Date.now() + crypto.randomBytes(4).toString('hex').toUpperCase();
  const now = new Date();

  await col.doc(orderId).update({
    data: {
      shippingFee: {
        amount,
        outTradeNo,
        payStatus: 'pending',
        setAt: now,
        paidAt: null,
      },
      updatedAt: now,
    },
  });

  return { code: 0, orderId, shippingFee: { amount, outTradeNo, payStatus: 'pending' } };
};
```

- [ ] **Step 4: 手动 verify load**

```bash
node -e "const fn = require('./cloudfunctions/_admin/setShippingFee'); console.log(typeof fn.main);"
```
Expected: `function`

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/_admin/setShippingFee/
git commit -m "feat(_admin): setShippingFee 云函数

团长 admin 设订单运费。写入 order.shippingFee 子文档,
生成 SHIP<...> outTradeNo,初始 payStatus='pending'。
已付不可改 (4 错误码)。

不主动推通知 — 用户进商城看红点/弹窗。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: getPendingOrders 云函数(用户)

**Files:**
- Create: `cloudfunctions/getPendingOrders/index.js`
- Create: `cloudfunctions/getPendingOrders/package.json`

- [ ] **Step 1: 写 package.json**

同 setShippingFee 套路。

- [ ] **Step 2: 写 index.js**

`cloudfunctions/getPendingOrders/index.js`:
```js
// getPendingOrders — 查当前用户所有 shippingFee.payStatus='pending' 的订单
//
// 入参: 无
// 出参: { code: 0, orders: [{ _id, orderNo, items[], shippingFee }] }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const res = await db
    .collection('orders')
    .where({
      _openid: OPENID,
      'shippingFee.payStatus': 'pending',
    })
    .orderBy('shippingFee.setAt', 'desc')
    .limit(20)
    .get();

  const orders = (res.data || []).map((o) => ({
    _id: o._id,
    orderNo: o.orderNo,
    items: o.items?.map((i) => ({ title: i.title, quantity: i.quantity })) || [],
    shippingFee: o.shippingFee,
  }));

  return { code: 0, orders };
};
```

- [ ] **Step 3: Commit**

```bash
git add cloudfunctions/getPendingOrders/
git commit -m "feat: getPendingOrders 云函数

返当前用户所有 shippingFee.payStatus='pending' 的订单,
按设运费时间倒序,limit 20。

前端首页 banner 调一次拉数 → 显示红点 + 弹窗。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: payShipping 云函数(用户)

**Files:**
- Create: `cloudfunctions/payShipping/index.js`
- Create: `cloudfunctions/payShipping/package.json`
- Create: `cloudfunctions/payShipping/huepay.js`(从 createOrder/huepay.js 复制 / require)
- Reference: `cloudfunctions/createOrder/index.js`(HuePay 调用模式)

- [ ] **Step 1: 看 createOrder/huepay.js 是否独立模块**

```bash
ls cloudfunctions/createOrder/
cat cloudfunctions/createOrder/huepay.js | head -30
```

- [ ] **Step 2: 复制 huepay.js**

```bash
cp cloudfunctions/createOrder/huepay.js cloudfunctions/payShipping/huepay.js
```

- [ ] **Step 3: 写 package.json + index.js**

`cloudfunctions/payShipping/index.js`:
```js
// payShipping — 用户支付订单尾款(运费)
//
// 入参: { orderId }
// 出参: { code: 0, payParams, raw } 同 createOrder.payParams 格式

const cloud = require('wx-server-sdk');
const huepay = require('./huepay');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const { orderId } = event || {};
  if (!orderId) return { code: 1, message: 'orderId required' };

  const doc = await db.collection('orders').doc(orderId).get().catch(() => null);
  if (!doc || !doc.data) return { code: 2, message: 'order not found' };
  const order = doc.data;

  if (order._openid !== OPENID) return { code: 3, message: '订单不属于当前用户' };
  if (!order.shippingFee) return { code: 4, message: '该订单未设运费' };
  if (order.shippingFee.payStatus === 'paid') return { code: 5, message: '运费已付' };
  if (order.shippingFee.amount <= 0) return { code: 6, message: '运费金额无效' };

  // 调 HuePay 拿 payParams(同 createOrder 模式,但 outTradeNo 用 shippingFee.outTradeNo)
  try {
    const body = `运费 ${order.orderNo}`;
    const { payParams, raw } = await huepay.createOrder({
      outTradeNo: order.shippingFee.outTradeNo,
      amount: order.shippingFee.amount,
      body,
      openid: OPENID,
    });
    return { code: 0, payParams, raw: raw ? { stub: !!raw.stub } : null };
  } catch (err) {
    console.error('[payShipping] HuePay failed', err);
    return { code: 7, message: '支付渠道异常:' + (err.message || err.code) };
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/payShipping/
git commit -m "feat: payShipping 云函数

用户支付订单尾款,调 HuePay 用 shippingFee.outTradeNo (SHIP<...>)
拿 payParams 返前端。

不更新 payStatus —— 等 HuePay notify 回调到来才更新 (paid)。

复用 createOrder/huepay.js (复制非 require,避免跨函数依赖)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: HuePay 回调按 outTradeNo 前缀路由

**Files:**
- Modify: `cloudfunctions/huepayNotify/index.js`(或现有 HuePay 回调处理云函数;先 grep 找)

- [ ] **Step 1: 找回调函数**

```bash
grep -rln "outTradeNo\|out_trade_no" cloudfunctions/ | grep -v createOrder | head
```

> 找到处理 HuePay notify 的函数(可能叫 huepayNotify / paymentCallback 等)。

- [ ] **Step 2: 看现有处理逻辑**

```bash
cat cloudfunctions/<found>/index.js
```

- [ ] **Step 3: 加 outTradeNo 前缀路由**

在原"找订单"逻辑前加分流。伪代码:

```js
const outTradeNo = event.outTradeNo; // or 从 raw notify 数据拿

if (outTradeNo.startsWith('SHIP')) {
  // 尾款支付回调
  const res = await db
    .collection('orders')
    .where({ 'shippingFee.outTradeNo': outTradeNo })
    .limit(1)
    .get();
  if (!res.data?.length) return { code: 1, message: 'order not found by SHIP outTradeNo' };
  const order = res.data[0];
  await db.collection('orders').doc(order._id).update({
    data: {
      'shippingFee.payStatus': 'paid',
      'shippingFee.paidAt': new Date(),
      updatedAt: new Date(),
    },
  });
  return { code: 0 };
}

// 现有的主订单逻辑保持不变(TRADE 前缀走原路径)
// ...
```

> 具体写法依赖现有代码结构,follow 已有 style。

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/<found>/index.js
git commit -m "feat(huepay-notify): outTradeNo 前缀路由,识别 SHIP 走尾款逻辑

SHIP* → 更新 order.shippingFee.payStatus=paid + paidAt
TRADE* → 原主订单逻辑不变

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: web-admin 订单详情加"设运费"UI

**Files:**
- Modify: `web-admin/src/pages/OrderDetail.tsx`
- Modify: `web-admin/src/api/order.ts`(加 setShippingFee caller)

- [ ] **Step 1: api/order.ts 加 setShippingFee**

读现有 `web-admin/src/api/order.ts` 找其他 admin caller 模式,追加:

```ts
export async function setShippingFee(orderId: string, amount: number) {
  const r = await client.post<any>('/cloud/_admin/setShippingFee', { orderId, amount });
  if (r.code !== 0) throw new Error(r.message || 'setShippingFee failed');
  return r;
}
```

- [ ] **Step 2: OrderDetail.tsx 加 UI block**

在订单详情 ant Card 块下加(具体位置 follow 现有 layout):

```tsx
import { InputNumber, Button, Form, message } from 'antd';
import { setShippingFee } from '../api/order';
// ...

// 在 OrderDetail 组件内,订单状态展示之后:
<Card title="运费尾款" style={{ marginTop: 16 }}>
  {order.shippingFee?.payStatus === 'paid' ? (
    <Tag color="green">已付 ¥{(order.shippingFee.amount / 100).toFixed(2)}</Tag>
  ) : order.shippingFee ? (
    <>
      <Tag color="orange">待付 ¥{(order.shippingFee.amount / 100).toFixed(2)}</Tag>
      <Form
        layout="inline"
        onFinish={async (vals) => {
          try {
            await setShippingFee(order._id, Math.round(vals.amount * 100));
            message.success('运费已更新');
            // 刷新 — 假设 fetchOrder 在组件里
            await fetchOrder();
          } catch (e: any) {
            message.error(e.message);
          }
        }}
      >
        <Form.Item name="amount" initialValue={order.shippingFee.amount / 100}>
          <InputNumber min={0} step={0.5} addonBefore="¥" />
        </Form.Item>
        <Form.Item>
          <Button htmlType="submit">改运费</Button>
        </Form.Item>
      </Form>
    </>
  ) : (
    <Form
      layout="inline"
      onFinish={async (vals) => {
        try {
          await setShippingFee(order._id, Math.round(vals.amount * 100));
          message.success('运费已设置,通知用户去群里@一下');
          await fetchOrder();
        } catch (e: any) {
          message.error(e.message);
        }
      }}
    >
      <Form.Item name="amount" rules={[{ required: true, message: '请输入金额' }]}>
        <InputNumber min={0} step={0.5} addonBefore="¥" placeholder="35.00" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">
          设置运费
        </Button>
      </Form.Item>
    </Form>
  )}
</Card>
```

- [ ] **Step 3: tsc check**

```bash
cd web-admin && npx tsc --noEmit 2>&1 | head
```

- [ ] **Step 4: Commit**

```bash
git add web-admin/src/api/order.ts web-admin/src/pages/OrderDetail.tsx
git commit -m "feat(web-admin): OrderDetail 加运费设置 UI

三种状态:
- 没 shippingFee → 输入金额 + 设置按钮
- shippingFee.payStatus='pending' → 显示待付金额 + 改运费 form
- shippingFee.payStatus='paid' → 显示已付绿标

调 _admin/setShippingFee 云函数。提示运营 \"通知用户去群里@\"
不发系统通知 (按决策走小红点路线)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: web-shop PendingOrderBanner + 首页集成

**Files:**
- Create: `web-shop/src/components/PendingOrderBanner.tsx`
- Modify: `web-shop/src/pages/Home.tsx`
- Modify: `web-shop/src/api/order.ts`(加 getPendingOrders caller)

- [ ] **Step 1: api/order.ts 加 caller**

```ts
export interface PendingOrder {
  _id: string;
  orderNo: string;
  items: Array<{ title: string; quantity: number }>;
  shippingFee: { amount: number; payStatus: 'pending'; setAt: string };
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const r = await client.post<any>('/cloud/getPendingOrders', {});
  if (r.code !== 0) throw new Error(r.message || 'failed');
  return r.orders;
}
```

- [ ] **Step 2: 写 PendingOrderBanner.tsx**

`web-shop/src/components/PendingOrderBanner.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from 'antd-mobile';
import { getPendingOrders, type PendingOrder } from '../api/order';
import { useAuthStore } from '../store/auth';

const DISMISS_KEY = 'pending_banner_dismissed_at';

export default function PendingOrderBanner() {
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [orders, setOrders] = useState<PendingOrder[]>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await getPendingOrders();
        setOrders(r);
      } catch (e) {
        // 静默 — 拿不到不打扰用户
      }
    })();
  }, [token]);

  if (!orders.length) return null;

  // dismiss 状态:同一天内只弹一次(用户点 dismiss 后不再弹,但红点在订单页仍显示)
  const dismissedAt = localStorage.getItem(DISMISS_KEY);
  const today = new Date().toISOString().slice(0, 10);
  if (dismissedAt === today) return null;

  const total = orders.reduce((s, o) => s + o.shippingFee.amount, 0);

  return (
    <Card style={{ margin: 12, background: '#FFF7E6', border: '1px solid #FFD591' }}>
      <div style={{ color: '#FA8C16', fontWeight: 'bold', marginBottom: 8 }}>
        ⚠️ 您有 {orders.length} 个订单待付运费 ¥{(total / 100).toFixed(2)}
      </div>
      <div style={{ marginBottom: 12, fontSize: 14, color: '#666' }}>
        {orders.slice(0, 3).map((o) => (
          <div key={o._id}>
            订单 {o.orderNo.slice(-6)}:¥{(o.shippingFee.amount / 100).toFixed(2)}
          </div>
        ))}
        {orders.length > 3 && <div>...共 {orders.length} 单</div>}
      </div>
      <Button
        color="warning"
        block
        size="small"
        onClick={() => {
          if (orders.length === 1) {
            nav(`/pay-shipping/${orders[0]._id}`);
          } else {
            nav('/orders?filter=pending_shipping');
          }
        }}
      >
        立即支付
      </Button>
      <Button
        block
        size="mini"
        fill="none"
        style={{ marginTop: 8 }}
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, today);
          setOrders([]);
        }}
      >
        今天不再提醒
      </Button>
    </Card>
  );
}
```

- [ ] **Step 3: Home.tsx 顶部加 banner**

读 `web-shop/src/pages/Home.tsx`,在顶部内容前加:

```tsx
import PendingOrderBanner from '../components/PendingOrderBanner';

// 在 return 的最顶部:
<PendingOrderBanner />
```

- [ ] **Step 4: tsc + Commit**

```bash
cd web-shop && npx tsc --noEmit 2>&1 | head
git add web-shop/src/api/order.ts web-shop/src/components/PendingOrderBanner.tsx web-shop/src/pages/Home.tsx
git commit -m "feat(web-shop): Home 顶 banner 提醒待付运费

进首页时调 getPendingOrders,有待付订单显示橙色 banner:
- 1 单 → '立即支付' 直跳 /pay-shipping/<id>
- 多单 → 跳 /orders?filter=pending_shipping 集中处理
- '今天不再提醒' 走 localStorage,跨日重弹

红点(订单 tab 上的)由下个 task 加。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: PayShipping 页面

**Files:**
- Create: `web-shop/src/pages/PayShipping.tsx`
- Modify: `web-shop/src/App.tsx`(加路由)
- Modify: `web-shop/src/api/order.ts`(加 payShipping caller + getOrderDetail 已有)

- [ ] **Step 1: api 加 caller**

```ts
export async function payShipping(orderId: string) {
  const r = await client.post<any>('/cloud/payShipping', { orderId });
  if (r.code !== 0) throw new Error(r.message || 'payShipping failed');
  return r; // { code, payParams, raw }
}
```

- [ ] **Step 2: 写 PayShipping.tsx**

`web-shop/src/pages/PayShipping.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Toast, Button, Skeleton } from 'antd-mobile';
import { getOrderDetail, payShipping } from '../api/order';
import type { Order } from '../types';

export default function PayShipping() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const o = await getOrderDetail(id!);
        setOrder(o);
      } catch (e: any) {
        Toast.show({ icon: 'fail', content: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handlePay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const r = await payShipping(order._id);
      // stub 模式 raw.stub=true,直接跳 PayResult;真实模式调起 HuePay SDK
      if (r.raw?.stub) {
        // dev: 直接跳 PayResult,假装支付完成(回调由 HuePay stub 在后端处理 — 此处简化)
        Toast.show({ icon: 'success', content: '支付成功(stub)' });
        setTimeout(() => nav('/orders', { replace: true }), 1500);
      } else {
        // TODO: 真实 HuePay 调起(同 Checkout 那边的 payParams 处理)
        // 这里走 HuePay H5 网关 — payParams 应该是个 URL,location.href 跳过去
        if (r.payParams?.payUrl) {
          window.location.href = r.payParams.payUrl;
        } else {
          Toast.show({ icon: 'fail', content: '支付参数异常' });
        }
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message });
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <Skeleton.Paragraph lineCount={5} animated />;
  if (!order || !order.shippingFee) {
    return <div style={{ padding: 20 }}>订单不存在或未设运费</div>;
  }

  return (
    <>
      <NavBar onBack={() => nav(-1)}>支付运费</NavBar>
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#666', fontSize: 14 }}>订单</div>
          <div>{order.orderNo}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#666', fontSize: 14 }}>商品</div>
          {order.items.map((i, idx) => (
            <div key={idx}>
              {i.title} × {i.quantity}
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: '#666', fontSize: 14 }}>运费</div>
          <div style={{ fontSize: 28, color: '#FA8C16' }}>
            ¥{(order.shippingFee.amount / 100).toFixed(2)}
          </div>
        </div>
        <Button block color="warning" loading={paying} onClick={handlePay}>
          确认支付
        </Button>
      </div>
    </>
  );
}
```

- [ ] **Step 3: App.tsx 加路由**

```tsx
<Route path="/pay-shipping/:id" element={<Protected><PayShipping /></Protected>} />
```

- [ ] **Step 4: Commit**

```bash
git add web-shop/src/pages/PayShipping.tsx web-shop/src/api/order.ts web-shop/src/App.tsx
git commit -m "feat(web-shop): PayShipping 页

显示订单 + 运费金额 + 确认支付按钮。调 payShipping 拿 payParams:
- stub mode → 跳 /orders 假装支付完成
- 真实模式 → location.href 跳 HuePay payUrl

回调由后端 huepayNotify 处理 (上个 task 已加 SHIP 前缀路由)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: 我的订单页加红点 + 待付标记

**Files:**
- Modify: `web-shop/src/pages/Orders.tsx`
- Modify: `web-shop/src/components/AppTabBar.tsx`(订单 tab 加红点)

- [ ] **Step 1: Orders.tsx 显示 shippingFee.payStatus='pending' 的标记**

读 `web-shop/src/pages/Orders.tsx`,在订单 item 渲染处加:

```tsx
{order.shippingFee?.payStatus === 'pending' && (
  <Tag color="warning">
    待付运费 ¥{(order.shippingFee.amount / 100).toFixed(2)}
  </Tag>
)}
{order.shippingFee?.payStatus === 'pending' && (
  <Button
    size="mini"
    color="warning"
    onClick={() => nav(`/pay-shipping/${order._id}`)}
  >
    去支付
  </Button>
)}
```

> 处理 ?filter=pending_shipping query — 若有,过滤只显示待付的。

- [ ] **Step 2: AppTabBar 订单 tab 加红点**

读 `web-shop/src/components/AppTabBar.tsx`,加 pendingCount state:

```tsx
const [pendingCount, setPendingCount] = useState(0);

useEffect(() => {
  (async () => {
    try {
      const r = await getPendingOrders();
      setPendingCount(r.length);
    } catch (e) {
      // 静默
    }
  })();
}, []);

// 在订单 tab 上:
<TabBar.Item
  key="orders"
  title="订单"
  icon={...}
  badge={pendingCount > 0 ? pendingCount : undefined}
/>
```

- [ ] **Step 3: Commit**

```bash
git add web-shop/src/pages/Orders.tsx web-shop/src/components/AppTabBar.tsx
git commit -m "feat(web-shop): 订单 tab 红点 + Orders 页待付标记

- AppTabBar: 订单 tab badge 显示待付数 (mount 时拉一次)
- Orders.tsx: 待付订单加橙色 tag + '去支付' 按钮
- ?filter=pending_shipping 时过滤只显示待付

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Phase 2 E2E 验证

- [ ] **Step 1: deploy + 等完成**

```bash
git push
gh run watch --workflow=deploy-app.yml
```

- [ ] **Step 2: 模拟团长结算运费**

```bash
# 微信里 OAuth 进 staging admin (或浏览器 admin/admin)
# 选一个已下的订单 (上次 ¥5.99 那单 MG...8E6238)
# 输运费 ¥3.50 → 设置
```

- [ ] **Step 3: 模拟用户收到提醒**

```bash
# 切回客户端商城首页
# 期望:橙色 banner "您有 1 个订单待付运费 ¥3.50"
# 点 "立即支付" → 跳 /pay-shipping/<id>
# 显示订单 + ¥3.50 + 确认支付
# 点确认 → stub 模式假装支付成功 → 跳 /orders
```

- [ ] **Step 4: 验数据库 payStatus 更新**

```bash
ssh -i ~/.ssh/mogu_deploy ubuntu@$VPS 'sudo docker exec mogu_mongo mongosh --quiet --eval "
  db.getSiblingDB(\"mogu_express\").orders.find({}, {orderNo:1, shippingFee:1}).pretty()
"'
```

期望:shippingFee.payStatus = 'paid', paidAt 有值

- [ ] **Step 5: 验红点消失**

刷新商城首页 → banner 应该没了。订单 tab badge 应该归零。

- [ ] **Step 6: 更新 staging-readiness.md**

```bash
# 加一节: § 4 OAuth + 待付订单流(2026-05-XX 验证通过)
git commit -am "docs(staging): Phase 2 待付订单流验证通过"
git push
```

---

## Self-Review

### Spec coverage

| 决策文档要求 | 对应 task |
|---|---|
| OAuth 静默 (snsapi_base) | Task 1, 2, 4 |
| 测试号 staging,正式号 prod | Task 5 |
| 二维码 fallback 非微信入口 | Task 4 (QrFallback.tsx) |
| 不发模板消息,不发短信 | 整个 Phase 2 没引入 SMS/template — 仅商城内显示 |
| admin 设运费 | Task 8, 12 |
| 商城内红点 + 弹窗 | Task 13 (banner), Task 15 (红点) |
| HuePay 回调路由 | Task 11 |
| 不动 createOrder 主流程 | Task 7 只加注释 ✓ |

### Placeholder scan

- Task 11 写了"找到 huepayNotify 函数" — 没给具体文件路径。这是因为我没在 codebase 里找过该文件。执行时需要先 grep。**可接受**:Step 1 已显式给出 grep 命令,Step 2 让 reader 读现有逻辑。
- Task 12 引用 `fetchOrder` 函数 — 没在前面 task 定义过,但是这是现有 OrderDetail.tsx 里已有的(它本来就要刷新订单数据)。执行时按现有 pattern follow。
- Task 14 写了"TODO: 真实 HuePay 调起" — 这部分跟 Checkout 现有处理逻辑一样,但 Checkout 那边的真实调起还没 finalize(HuePay 凭证未拿到)。**当前阶段 stub mode 够**,真实调起留给 HuePay 接入时统一处理。

### Type consistency

- `shippingFee` schema 在 Task 7、8、9、10、11、12、13、14、15 反复出现,字段名一致:`amount` / `outTradeNo` / `payStatus` / `setAt` / `paidAt`。✓
- `outTradeNo` 前缀:Task 8 写 `SHIP`,Task 11 路由识别 `SHIP`,Task 10 用 `shippingFee.outTradeNo`。一致 ✓
- JWT payload:Task 1 wxLogin 签 `{openid, phone, role: 'customer'}`,跟现有 verifyOtp 一致 ✓
- WeChat 凭证 env 名:`WECHAT_APP_ID` / `WECHAT_APP_SECRET`(后端)+ `VITE_WECHAT_APP_ID`(前端 build),GH 端用 `WECHAT_APP_ID_STAGING` variable + `WECHAT_APP_SECRET_STAGING` secret。一致 ✓

---

## Estimated effort

| Phase | 任务 | 时长 |
|---|---|---|
| 1 | OAuth 后端 (Task 1) | 1.5 h |
| 1 | OAuth 前端 (Task 2-4) | 1.5 h |
| 1 | 配 env (Task 5) | 0.5 h |
| 1 | E2E (Task 6) | 0.5 h |
| 2 | 数据模型 (Task 7) | 0.1 h |
| 2 | 后端云函数 (Task 8-11) | 3 h |
| 2 | admin UI (Task 12) | 1 h |
| 2 | 前端 banner + 红点 + PayShipping (Task 13-15) | 2.5 h |
| 2 | E2E (Task 16) | 1 h |
| **合计** | | **~11.6 h ≈ 1.5 day** |
