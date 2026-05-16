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
