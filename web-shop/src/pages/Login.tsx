import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Input, Button, Toast } from 'antd-mobile';
import { sendOtp, verifyOtp } from '../api/auth';
import { useAuthStore } from '../store/auth';

const PHONE_RE = /^1[3-9]\d{9}$/;

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/';
  const setAuth = useAuthStore((s) => s.setAuth);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  const startCooldown = (sec: number) => {
    setCooldown(sec);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = window.setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const onSend = async () => {
    if (!PHONE_RE.test(phone)) {
      Toast.show({ icon: 'fail', content: '请输入正确的手机号' });
      return;
    }
    setSending(true);
    try {
      const r = await sendOtp(phone);
      Toast.show({ icon: 'success', content: '验证码已发送' });
      startCooldown(r.expiresIn || 60);
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '发送失败' });
    } finally {
      setSending(false);
    }
  };

  const onVerify = async () => {
    if (otp.length !== 6) {
      Toast.show({ icon: 'fail', content: '验证码 6 位数字' });
      return;
    }
    setVerifying(true);
    try {
      const r = await verifyOtp(phone, otp);
      setAuth(r.token, { openid: r.openid, phone, name: r.user?.name }, r.isRegistered);
      Toast.show({ icon: 'success', content: '登录成功' });
      if (!r.isRegistered) {
        nav(`/register-profile?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      } else {
        nav(returnTo, { replace: true });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '验证失败' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar onBack={() => nav(-1)}>登录</NavBar>
      <div className="p-6 space-y-6 bg-white mt-3">
        <div className="text-xl font-medium">手机号登录</div>
        <div className="text-xs text-gray-400">未注册的手机号验证后将自动创建账号</div>

        <div className="space-y-3">
          <div className="flex items-center border-b border-gray-200 pb-2">
            <span className="text-gray-500 mr-3">+86</span>
            <Input
              placeholder="请输入手机号"
              type="tel"
              maxLength={11}
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, ''))}
              className="flex-1"
            />
          </div>

          <div className="flex items-center border-b border-gray-200 pb-2">
            <Input
              placeholder="6 位验证码"
              type="text"
              maxLength={6}
              value={otp}
              onChange={(v) => setOtp(v.replace(/\D/g, ''))}
              className="flex-1"
            />
            <Button
              size="small"
              color="primary"
              fill="none"
              disabled={cooldown > 0 || sending}
              loading={sending}
              onClick={onSend}
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : '发送验证码'}
            </Button>
          </div>
        </div>

        <Button
          block
          color="primary"
          size="large"
          loading={verifying}
          disabled={!PHONE_RE.test(phone) || otp.length !== 6}
          onClick={onVerify}
        >
          登录 / 注册
        </Button>

        <div className="text-xs text-gray-400 text-center">
          登录即表示同意 <a className="text-brand">用户协议</a> 和 <a className="text-brand">隐私政策</a>
        </div>
      </div>
    </div>
  );
}
