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
        setAuth(
          r.token,
          {
            openid: r.openid,
            name: r.user?.name,
            phone: r.user?.phone,
            wechat: r.user?.wechat ?? null,
          },
          r.isRegistered,
        );
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
