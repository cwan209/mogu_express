import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  NavBar, List, Image, Button, TextArea, Toast, Empty, Dialog, Popup,
} from 'antd-mobile';
import { RightOutline, LocationOutline } from 'antd-mobile-icons';
import dayjs from 'dayjs';
import { listAddresses, type Address } from '../api/address';
import { createOrder } from '../api/order';
import { listMyCoupons } from '../api/coupon';
import type { Coupon } from '../types';
import { useCartStore } from '../store/cart';
import { formatCny } from '../utils/money';

export default function Checkout() {
  const nav = useNavigate();
  const items = useCartStore((s) => s.items);
  const totalCents = useCartStore((s) => s.totalCents());
  const totalQty = useCartStore((s) => s.totalQty());
  const clear = useCartStore((s) => s.clear);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [picked, setPicked] = useState<Address | null>(null);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 优惠券 (Sprint 2.6)
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [pickedCoupon, setPickedCoupon] = useState<Coupon | null>(null);
  const [couponPickerOpen, setCouponPickerOpen] = useState(false);

  const discount = pickedCoupon ? Math.min(pickedCoupon.amount, totalCents) : 0;
  const finalTotal = Math.max(0, totalCents - discount);

  // cart sync 已由 App.tsx 在 login 时统一处理(getCart 覆盖 local + debounced replaceCart push)
  // 不再需要 checkout 时 mergeCart

  // 加载地址列表 + 默认选中
  const loadAddresses = async () => {
    try {
      const list = await listAddresses();
      setAddresses(list);
      // 优先 sessionStorage 选中的
      const sid = sessionStorage.getItem('picked-address-id');
      if (sid) {
        sessionStorage.removeItem('picked-address-id');
        const picked = list.find((a) => a._id === sid);
        if (picked) setPicked(picked);
        return;
      }
      const def = list.find((a) => a.isDefault) || list[0];
      if (def) setPicked(def);
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '加载地址失败' });
    }
  };

  useEffect(() => { loadAddresses(); }, []);

  // 加载可用优惠券(未过期 + 已生效 + status=unused)
  useEffect(() => {
    listMyCoupons('unused')
      .then((list) => {
        const now = Date.now();
        const usable = list.filter(
          (c) =>
            new Date(c.validTo).getTime() > now &&
            new Date(c.validFrom).getTime() <= now,
        );
        setAvailableCoupons(usable);
      })
      .catch(() => {});
  }, []);

  const onSubmit = async () => {
    if (items.length === 0) {
      Toast.show({ icon: 'fail', content: '购物车为空' });
      return;
    }
    if (!picked) {
      Dialog.confirm({
        content: '请先添加收货地址',
        confirmText: '去添加',
        onConfirm: () => nav('/addresses?pick=1'),
      });
      return;
    }
    setSubmitting(true);
    try {
      const r = await createOrder({
        items: items.map((it) => ({ tuanItemId: it.tuanItemId, quantity: it.quantity })),
        addressId: picked._id,
        remark,
        couponId: pickedCoupon?._id,
      });
      // 下单成功后清前端购物车(后端 createOrder 也会清服务端 carts)
      clear();
      setPickedCoupon(null);
      // 跳支付页(stub 模式有 __stub 标记,真实模式有 redirectUrl)
      if (r.payParams?.__stub) {
        nav(`/pay-result/${r.orderId}?stub=1`, { replace: true });
      } else if (r.payParams?.redirectUrl) {
        window.location.href = r.payParams.redirectUrl;
      } else {
        nav(`/pay-result/${r.orderId}`, { replace: true });
      }
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: e.message || '下单失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <NavBar onBack={() => nav(-1)}>确认订单</NavBar>

      {/* 地址 */}
      <List className="mt-2">
        {picked ? (
          <List.Item
            prefix={<LocationOutline />}
            arrow={<RightOutline />}
            description={
              <span className="text-xs">
                {picked.line1}{picked.line2 ? `, ${picked.line2}` : ''}, {picked.suburb}, {picked.state} {picked.postcode}
              </span>
            }
            onClick={() => nav('/addresses?pick=1')}
          >
            <span className="font-medium">{picked.recipient}</span>
            <span className="text-xs text-gray-500 ml-2">{picked.phone}</span>
          </List.Item>
        ) : addresses.length > 0 ? (
          <List.Item
            prefix={<LocationOutline />}
            arrow={<RightOutline />}
            onClick={() => nav('/addresses?pick=1')}
          >
            选择收货地址
          </List.Item>
        ) : (
          <List.Item
            prefix={<LocationOutline />}
            arrow={<RightOutline />}
            onClick={() => nav('/addresses?pick=1')}
          >
            添加收货地址
          </List.Item>
        )}
      </List>

      {/* 商品列表 */}
      <div className="bg-white mt-2">
        {items.length === 0 ? (
          <Empty description="购物车为空" />
        ) : (
          items.map((it) => (
            <div key={it.tuanItemId} className="flex p-3 gap-3 border-b border-gray-100">
              <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                {it.coverFileId && (
                  <Image src={it.coverFileId} width={64} height={64} fit="cover" lazy />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm line-clamp-2">{it.title}</div>
                <div className="text-xs text-gray-500 mt-1">×{it.quantity}</div>
              </div>
              <div className="text-brand">{formatCny(it.price * it.quantity)}</div>
            </div>
          ))
        )}
      </div>

      {/* 备注 */}
      <div className="bg-white mt-2 p-3">
        <div className="text-xs text-gray-500 mb-2">备注</div>
        <TextArea
          placeholder="选填,如:不要太辣 / 留门卫 / 优先发货"
          value={remark}
          maxLength={200}
          rows={2}
          onChange={setRemark}
        />
      </div>

      {/* 优惠券 (Sprint 2.6) */}
      <List className="mt-2">
        <List.Item
          prefix={<span>🎟️</span>}
          arrow={availableCoupons.length > 0 ? <RightOutline /> : null}
          extra={
            pickedCoupon
              ? <span className="text-brand">-{formatCny(Math.min(pickedCoupon.amount, totalCents))}</span>
              : availableCoupons.length > 0
                ? <span className="text-gray-500">{availableCoupons.length} 张可用</span>
                : <span className="text-gray-400">无可用</span>
          }
          onClick={() => availableCoupons.length > 0 && setCouponPickerOpen(true)}
        >
          优惠券
        </List.Item>
      </List>

      <Popup
        visible={couponPickerOpen}
        onMaskClick={() => setCouponPickerOpen(false)}
        bodyStyle={{ maxHeight: '60vh', overflow: 'auto', padding: 16 }}
      >
        <div className="text-lg font-medium mb-3">选择优惠券</div>
        {pickedCoupon && (
          <div
            className="p-3 mb-2 border rounded text-center text-gray-500 border-gray-200"
            onClick={() => { setPickedCoupon(null); setCouponPickerOpen(false); }}
          >
            不使用优惠券
          </div>
        )}
        {availableCoupons.map((c) => (
          <div
            key={c._id}
            className={`p-3 mb-2 border rounded ${pickedCoupon?._id === c._id ? 'border-brand bg-red-50' : 'border-gray-200'}`}
            onClick={() => { setPickedCoupon(c); setCouponPickerOpen(false); }}
          >
            <div className="text-brand font-medium text-lg">{formatCny(c.amount)}</div>
            <div className="text-xs text-gray-500 mt-1">{c.reason || '优惠券'}</div>
            <div className="text-xs text-gray-400 mt-1">
              {dayjs(c.validFrom).format('MM-DD')} ~ {dayjs(c.validTo).format('MM-DD')}
            </div>
          </div>
        ))}
      </Popup>

      {/* 底部支付栏 */}
      <div className="fixed left-0 right-0 bottom-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 p-3 flex items-center justify-between z-50">
        <div>
          <div className="text-xs text-gray-500">共 {totalQty} 件</div>
          <div className="text-brand font-medium text-lg">
            {formatCny(finalTotal)}
            {discount > 0 && (
              <span className="text-xs text-gray-400 ml-2 line-through">{formatCny(totalCents)}</span>
            )}
          </div>
        </div>
        <Button
          color="primary"
          size="large"
          loading={submitting}
          disabled={items.length === 0}
          onClick={onSubmit}
        >
          提交订单
        </Button>
      </div>
    </div>
  );
}
