import { useNavigate } from 'react-router-dom';
import { NavBar, List, Dialog, Image } from 'antd-mobile';
import {
  UserOutline, UnorderedListOutline, LocationOutline, RightOutline, ShopbagOutline,
} from 'antd-mobile-icons';
import { useAuthStore } from '../store/auth';
import { useCartStore } from '../store/cart';

export default function Profile() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const cartQty = useCartStore((s) => s.totalQty());

  const onLogout = () => {
    Dialog.confirm({
      content: '确定退出登录?',
      onConfirm: () => {
        logout();
        nav('/', { replace: true });
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar back={null}>我的</NavBar>

      {/* 用户卡片 — 优先用微信 OAuth 拉到的 nickname+avatar,fallback 到自填资料 */}
      <div className="bg-white p-4 flex items-center gap-3">
        {user?.wechat?.avatar ? (
          <Image
            src={user.wechat.avatar}
            width={56}
            height={56}
            fallback={
              <div className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center text-2xl">
                {(user?.wechat?.nickname || user?.name || '?').slice(0, 1).toUpperCase()}
              </div>
            }
            style={{ borderRadius: '50%' }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center text-2xl">
            {(user?.wechat?.nickname || user?.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium">
            {user?.wechat?.nickname || user?.name || '微信用户'}
          </div>
          {/* 仅 OTP 流程用户(没 wechat 资料)显示手机号 — OAuth 用户的手机号
              是历史 OTP/RegisterProfile 残留,不是身份标识,UI 不展示 */}
          {!user?.wechat && user?.phone && (
            <div className="text-xs text-gray-500 mt-0.5">{user.phone}</div>
          )}
        </div>
      </div>

      <List className="mt-2">
        <List.Item
          prefix={<UnorderedListOutline />}
          arrow={<RightOutline />}
          onClick={() => nav('/orders')}
        >
          我的订单
        </List.Item>
        <List.Item
          prefix={<ShopbagOutline />}
          arrow={<RightOutline />}
          extra={cartQty > 0 ? `${cartQty} 件` : ''}
          onClick={() => nav('/cart')}
        >
          购物车
        </List.Item>
        <List.Item
          prefix={<LocationOutline />}
          arrow={<RightOutline />}
          onClick={() => nav('/addresses')}
        >
          收货地址
        </List.Item>
      </List>

      <List className="mt-2" header="账号">
        <List.Item
          prefix={<UserOutline />}
          arrow={<RightOutline />}
          onClick={() => nav('/register-profile?returnTo=/profile')}
        >
          完善资料
        </List.Item>
      </List>

      <div className="p-4">
        <a className="block text-center text-gray-500 py-3 bg-white rounded" onClick={onLogout}>
          退出登录
        </a>
      </div>
    </div>
  );
}
